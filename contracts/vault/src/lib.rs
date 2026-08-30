#![no_std]
//! # Sigil Vault
//!
//! An M-of-N multisig treasury for Stellar. Funds sit at the contract address
//! and only move through a proposal that has collected `threshold` approvals
//! from the *current* signer set and cleared its timelock.
//!
//! Three properties shape the whole design:
//!
//! 1. **No privileged address.** Adding a signer, lowering the threshold and
//!    paying an invoice all travel the identical propose/approve/execute path.
//!    There is no admin key to steal.
//! 2. **Approvals are re-counted at execution.** The approval log is history,
//!    not authority. `execute` intersects it with the live signer set, so
//!    removing a compromised signer instantly voids their pending approvals.
//! 3. **Execution is permissionless.** Once a proposal is legal, anyone may
//!    push the button — which is what lets a fee-bump relayer settle it and
//!    keeps signers from ever needing XLM of their own.

use soroban_sdk::{contract, contractimpl, panic_with_error, token, vec, Address, Env, Vec};

mod events;
mod storage;
mod types;

#[cfg(test)]
mod test;

use events::{
    Approved, Cancelled, ConfigChanged, Deposited, Executed, LimitChanged, Proposed, Revoked,
};
pub use types::{Action, Config, Error, Proposal, SpendLimit, Status, Transfer};
use types::{MAX_SIGNERS, SPEND_WINDOW};

#[contract]
pub struct SigilVault;

#[contractimpl]
impl SigilVault {
    /// Creates the vault. `timelock` is the delay between a proposal reaching
    /// its threshold and becoming executable; `proposal_ttl` is how long a
    /// proposal stays alive before it expires unexecuted.
    pub fn __constructor(
        env: Env,
        signers: Vec<Address>,
        threshold: u32,
        timelock: u64,
        proposal_ttl: u64,
    ) {
        validate_signer_set(&env, &signers);
        if let Err(error) = check_threshold(threshold, signers.len()) {
            panic_with_error!(&env, error);
        }
        if proposal_ttl == 0 {
            panic_with_error!(&env, Error::InvalidConfig);
        }

        let config = Config {
            signers,
            threshold,
            timelock,
            proposal_ttl,
        };
        storage::write_config(&env, &config);
        storage::bump_instance(&env);

        ConfigChanged {
            signer_count: config.signers.len(),
            threshold: config.threshold,
            timelock: config.timelock,
        }
        .publish(&env);
    }

    /// Pulls `amount` of `token` from `from` into the vault. Direct transfers
    /// to the vault address work too; this exists so deposits emit an event.
    pub fn deposit(env: Env, from: Address, token: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        storage::bump_instance(&env);

        token::TokenClient::new(&env, &token).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );
        Deposited {
            token,
            from,
            amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Opens a proposal. The proposer's own approval is recorded immediately,
    /// so a 1-of-N vault executes after a single round trip.
    pub fn propose(env: Env, proposer: Address, action: Action) -> Result<u32, Error> {
        proposer.require_auth();
        let config = storage::read_config(&env);
        require_signer(&config, &proposer)?;
        validate_action(&config, &action)?;
        storage::bump_instance(&env);

        let now = env.ledger().timestamp();
        let id = storage::take_next_id(&env);
        let mut proposal = Proposal {
            id,
            proposer: proposer.clone(),
            action,
            approvals: vec![&env, proposer.clone()],
            status: Status::Pending,
            created_at: now,
            ready_at: 0,
            expires_at: now + config.proposal_ttl,
        };
        if count_valid_approvals(&config, &proposal.approvals) >= config.threshold {
            proposal.ready_at = now + config.timelock;
        }
        storage::write_proposal(&env, &proposal);

        Proposed {
            id,
            proposer,
            expires_at: proposal.expires_at,
        }
        .publish(&env);
        Ok(id)
    }

    /// Adds `signer`'s approval. Reaching the threshold starts the timelock.
    pub fn approve(env: Env, signer: Address, id: u32) -> Result<(), Error> {
        signer.require_auth();
        let config = storage::read_config(&env);
        require_signer(&config, &signer)?;
        storage::bump_instance(&env);

        let mut proposal = storage::read_proposal(&env, id)?;
        require_open(&env, &proposal)?;
        if proposal.approvals.contains(&signer) {
            return Err(Error::AlreadyApproved);
        }

        proposal.approvals.push_back(signer.clone());
        let valid = count_valid_approvals(&config, &proposal.approvals);
        if proposal.ready_at == 0 && valid >= config.threshold {
            proposal.ready_at = env.ledger().timestamp() + config.timelock;
        }
        storage::write_proposal(&env, &proposal);

        Approved {
            id,
            signer,
            valid,
            threshold: config.threshold,
            ready_at: proposal.ready_at,
        }
        .publish(&env);
        Ok(())
    }

    /// Withdraws an approval. Dropping back below the threshold clears the
    /// timelock, so a signer's objection genuinely buys the group time.
    pub fn revoke(env: Env, signer: Address, id: u32) -> Result<(), Error> {
        signer.require_auth();
        let config = storage::read_config(&env);
        storage::bump_instance(&env);

        let mut proposal = storage::read_proposal(&env, id)?;
        require_open(&env, &proposal)?;
        match proposal.approvals.first_index_of(&signer) {
            Some(index) => proposal.approvals.remove(index),
            None => return Err(Error::NotApproved),
        };

        let valid = count_valid_approvals(&config, &proposal.approvals);
        if valid < config.threshold {
            proposal.ready_at = 0;
        }
        storage::write_proposal(&env, &proposal);

        Revoked {
            id,
            signer,
            valid,
            threshold: config.threshold,
        }
        .publish(&env);
        Ok(())
    }

    /// Withdraws a proposal entirely. Only the proposer can do this, and only
    /// while it is still pending.
    pub fn cancel(env: Env, signer: Address, id: u32) -> Result<(), Error> {
        signer.require_auth();
        storage::bump_instance(&env);

        let mut proposal = storage::read_proposal(&env, id)?;
        if proposal.status != Status::Pending {
            return Err(Error::NotPending);
        }
        if proposal.proposer != signer {
            return Err(Error::NotProposer);
        }

        proposal.status = Status::Cancelled;
        storage::write_proposal(&env, &proposal);

        Cancelled { id, signer }.publish(&env);
        Ok(())
    }

    /// Carries out an approved proposal. Deliberately permissionless: the
    /// gate is the proposal's own state, not the caller's identity, so a
    /// relayer can pay the fee on the signers' behalf.
    pub fn execute(env: Env, id: u32) -> Result<(), Error> {
        let config = storage::read_config(&env);
        storage::bump_instance(&env);

        let mut proposal = storage::read_proposal(&env, id)?;
        require_open(&env, &proposal)?;

        if count_valid_approvals(&config, &proposal.approvals) < config.threshold {
            return Err(Error::ThresholdNotMet);
        }
        if proposal.ready_at == 0 || env.ledger().timestamp() < proposal.ready_at {
            return Err(Error::TimelockActive);
        }

        // Close the proposal before the external token call: a hostile token
        // contract that re-enters finds nothing left to execute.
        proposal.status = Status::Executed;
        storage::write_proposal(&env, &proposal);

        apply(&env, config, &proposal.action)?;

        Executed {
            id,
            proposer: proposal.proposer,
        }
        .publish(&env);
        Ok(())
    }

    // ----- views -----

    pub fn config(env: Env) -> Config {
        storage::read_config(&env)
    }

    pub fn proposal(env: Env, id: u32) -> Result<Proposal, Error> {
        storage::read_proposal(&env, id)
    }

    /// Page through proposals from `start`, oldest first. Ids whose entries
    /// have expired out of storage are skipped rather than aborting the page.
    pub fn proposals(env: Env, start: u32, limit: u32) -> Vec<Proposal> {
        let next = storage::peek_next_id(&env);
        let mut page = vec![&env];
        let mut id = start;
        while id < next && page.len() < limit {
            if let Some(proposal) = storage::try_read_proposal(&env, id) {
                page.push_back(proposal);
            }
            id += 1;
        }
        page
    }

    pub fn proposal_count(env: Env) -> u32 {
        storage::peek_next_id(&env)
    }

    /// Approvals that still count, i.e. those from addresses that are signers
    /// right now. This is the number `execute` compares to the threshold.
    pub fn valid_approvals(env: Env, id: u32) -> Result<u32, Error> {
        let config = storage::read_config(&env);
        let proposal = storage::read_proposal(&env, id)?;
        Ok(count_valid_approvals(&config, &proposal.approvals))
    }

    pub fn is_signer(env: Env, address: Address) -> bool {
        storage::read_config(&env).signers.contains(&address)
    }

    /// `0` means the token has no daily cap.
    pub fn daily_limit(env: Env, token: Address) -> i128 {
        storage::read_limit(&env, &token)
    }

    /// Amount of `token` already sent out in the current day bucket.
    pub fn spent_today(env: Env, token: Address) -> i128 {
        let day = env.ledger().timestamp() / SPEND_WINDOW;
        storage::read_spent(&env, &token, day)
    }

    pub fn balance(env: Env, token: Address) -> i128 {
        token::TokenClient::new(&env, &token).balance(&env.current_contract_address())
    }
}

// ----- internals -----

fn require_signer(config: &Config, address: &Address) -> Result<(), Error> {
    if config.signers.contains(address) {
        Ok(())
    } else {
        Err(Error::NotSigner)
    }
}

/// A proposal is open if it is pending and has not passed its expiry.
fn require_open(env: &Env, proposal: &Proposal) -> Result<(), Error> {
    if proposal.status != Status::Pending {
        return Err(Error::NotPending);
    }
    if env.ledger().timestamp() > proposal.expires_at {
        return Err(Error::Expired);
    }
    Ok(())
}

/// Intersects the approval log with the live signer set. This is what makes
/// removing a signer retroactively void their pending approvals.
fn count_valid_approvals(config: &Config, approvals: &Vec<Address>) -> u32 {
    let mut valid = 0;
    for approver in approvals.iter() {
        if config.signers.contains(&approver) {
            valid += 1;
        }
    }
    valid
}

fn validate_signer_set(env: &Env, signers: &Vec<Address>) {
    if signers.is_empty() || signers.len() > MAX_SIGNERS {
        panic_with_error!(env, Error::InvalidSignerSet);
    }
    for (index, signer) in signers.iter().enumerate() {
        if signers.first_index_of(&signer) != Some(index as u32) {
            panic_with_error!(env, Error::DuplicateSigner);
        }
    }
}

/// Rejects proposals that could never execute, so signers never waste a round
/// of approvals on them. Conditions that depend on future state (balances,
/// daily spend, a config that may still move) are left to `execute`.
fn validate_action(config: &Config, action: &Action) -> Result<(), Error> {
    match action {
        Action::Transfer(transfer) => {
            if transfer.amount <= 0 {
                return Err(Error::InvalidAmount);
            }
        }
        Action::AddSigner(signer) => check_addable(config, signer)?,
        Action::RemoveSigner(signer) => {
            if !config.signers.contains(signer) {
                return Err(Error::SignerMissing);
            }
            if config.signers.len() - 1 < config.threshold {
                return Err(Error::ThresholdUnreachable);
            }
        }
        Action::SetThreshold(threshold) => check_threshold(*threshold, config.signers.len())?,
        Action::SetDailyLimit(limit) => {
            if limit.daily_limit < 0 {
                return Err(Error::InvalidConfig);
            }
        }
        Action::SetTimelock(_) => {}
    }
    Ok(())
}

fn check_addable(config: &Config, signer: &Address) -> Result<(), Error> {
    if config.signers.contains(signer) {
        return Err(Error::SignerExists);
    }
    if config.signers.len() >= MAX_SIGNERS {
        return Err(Error::InvalidSignerSet);
    }
    Ok(())
}

fn check_threshold(threshold: u32, signer_count: u32) -> Result<(), Error> {
    if threshold == 0 || threshold > signer_count {
        return Err(Error::InvalidThreshold);
    }
    Ok(())
}

/// Applies an approved action. Every branch re-checks its invariants against
/// live state, because the config may have moved since the proposal was made.
fn apply(env: &Env, mut config: Config, action: &Action) -> Result<(), Error> {
    match action {
        Action::Transfer(transfer) => {
            charge_daily_limit(env, &transfer.token, transfer.amount)?;
            token::TokenClient::new(env, &transfer.token).transfer(
                &env.current_contract_address(),
                &transfer.to,
                &transfer.amount,
            );
        }
        Action::AddSigner(signer) => {
            check_addable(&config, signer)?;
            config.signers.push_back(signer.clone());
            commit_config(env, &config);
        }
        Action::RemoveSigner(signer) => {
            match config.signers.first_index_of(signer) {
                Some(index) => config.signers.remove(index),
                None => return Err(Error::SignerMissing),
            };
            if config.signers.len() < config.threshold {
                return Err(Error::ThresholdUnreachable);
            }
            commit_config(env, &config);
        }
        Action::SetThreshold(threshold) => {
            check_threshold(*threshold, config.signers.len())?;
            config.threshold = *threshold;
            commit_config(env, &config);
        }
        Action::SetDailyLimit(limit) => {
            if limit.daily_limit < 0 {
                return Err(Error::InvalidConfig);
            }
            storage::write_limit(env, &limit.token, limit.daily_limit);
            LimitChanged {
                token: limit.token.clone(),
                daily_limit: limit.daily_limit,
            }
            .publish(env);
        }
        Action::SetTimelock(seconds) => {
            config.timelock = *seconds;
            commit_config(env, &config);
        }
    }
    Ok(())
}

fn commit_config(env: &Env, config: &Config) {
    storage::write_config(env, config);
    ConfigChanged {
        signer_count: config.signers.len(),
        threshold: config.threshold,
        timelock: config.timelock,
    }
    .publish(env);
}

/// Enforces the token's daily cap and records the spend. A cap of `0` is the
/// default and means unlimited.
fn charge_daily_limit(env: &Env, token: &Address, amount: i128) -> Result<(), Error> {
    let limit = storage::read_limit(env, token);
    if limit == 0 {
        return Ok(());
    }
    let day = env.ledger().timestamp() / SPEND_WINDOW;
    let spent = storage::read_spent(env, token, day) + amount;
    if spent > limit {
        return Err(Error::DailyLimitExceeded);
    }
    storage::write_spent(env, token, day, spent);
    Ok(())
}
