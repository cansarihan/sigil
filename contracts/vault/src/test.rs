#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::StellarAssetClient,
    vec, Address, Env, Vec,
};

use crate::{Action, Error, SigilVault, SigilVaultClient, SpendLimit, Status, Transfer};

const TTL: u64 = 7 * 86_400;
const START: u64 = 1_700_000_000;

struct Ctx<'a> {
    env: Env,
    vault: SigilVaultClient<'a>,
    token: Address,
    minter: StellarAssetClient<'a>,
    signers: Vec<Address>,
    outsider: Address,
    payee: Address,
}

impl<'a> Ctx<'a> {
    fn signer(&self, index: u32) -> Address {
        self.signers.get(index).unwrap()
    }

    fn advance(&self, seconds: u64) {
        let now = self.env.ledger().timestamp();
        self.env.ledger().set_timestamp(now + seconds);
    }

    /// A transfer proposal for `amount` of the fixture token to the payee.
    fn payout(&self, amount: i128) -> Action {
        Action::Transfer(Transfer {
            token: self.token.clone(),
            to: self.payee.clone(),
            amount,
        })
    }
}

/// Builds an `n`-signer vault funded with 1_000 units of a test token.
fn setup(signer_count: u32, threshold: u32, timelock: u64) -> Ctx<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(START);

    let mut signers = vec![&env];
    for _ in 0..signer_count {
        signers.push_back(Address::generate(&env));
    }

    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    let token = asset.address();
    let minter = StellarAssetClient::new(&env, &token);

    let id = env.register(SigilVault, (signers.clone(), threshold, timelock, TTL));
    let vault = SigilVaultClient::new(&env, &id);
    minter.mint(&id, &1_000);

    let outsider = Address::generate(&env);
    let payee = Address::generate(&env);

    Ctx {
        env,
        vault,
        token,
        minter,
        signers,
        outsider,
        payee,
    }
}

/// Drives a proposal from `propose` through enough approvals to meet the
/// threshold, then clears the timelock. Returns the proposal id.
fn approve_to_threshold(ctx: &Ctx, action: Action, approvers: u32, timelock: u64) -> u32 {
    let id = ctx.vault.propose(&ctx.signer(0), &action);
    for index in 1..approvers {
        ctx.vault.approve(&ctx.signer(index), &id);
    }
    if timelock > 0 {
        ctx.advance(timelock + 1);
    }
    id
}

// ----- construction -----

#[test]
fn constructor_stores_the_config() {
    let ctx = setup(3, 2, 0);
    let config = ctx.vault.config();
    assert_eq!(config.threshold, 2);
    assert_eq!(config.signers.len(), 3);
    assert_eq!(config.proposal_ttl, TTL);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn constructor_rejects_an_empty_signer_set() {
    let env = Env::default();
    let signers: Vec<Address> = vec![&env];
    env.register(SigilVault, (signers, 1u32, 0u64, TTL));
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn constructor_rejects_duplicate_signers() {
    let env = Env::default();
    let signer = Address::generate(&env);
    let signers = vec![&env, signer.clone(), signer];
    env.register(SigilVault, (signers, 1u32, 0u64, TTL));
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn constructor_rejects_threshold_above_signer_count() {
    let env = Env::default();
    let signers = vec![&env, Address::generate(&env)];
    env.register(SigilVault, (signers, 3u32, 0u64, TTL));
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn constructor_rejects_a_zero_threshold() {
    let env = Env::default();
    let signers = vec![&env, Address::generate(&env)];
    env.register(SigilVault, (signers, 0u32, 0u64, TTL));
}

// ----- funding -----

#[test]
fn deposit_moves_tokens_into_the_vault() {
    let ctx = setup(3, 2, 0);
    let funder = Address::generate(&ctx.env);
    ctx.minter.mint(&funder, &500);

    ctx.vault.deposit(&funder, &ctx.token, &500);

    assert_eq!(ctx.vault.balance(&ctx.token), 1_500);
}

#[test]
fn deposit_rejects_non_positive_amounts() {
    let ctx = setup(3, 2, 0);
    let funder = Address::generate(&ctx.env);
    assert_eq!(
        ctx.vault.try_deposit(&funder, &ctx.token, &0),
        Err(Ok(Error::InvalidAmount))
    );
}

// ----- the happy path -----

#[test]
fn a_single_signer_vault_settles_in_one_round() {
    let ctx = setup(1, 1, 0);
    let id = ctx.vault.propose(&ctx.signer(0), &ctx.payout(100));

    ctx.vault.execute(&id);

    assert_eq!(ctx.vault.balance(&ctx.token), 900);
    assert_eq!(ctx.vault.proposal(&id).status, Status::Executed);
}

#[test]
fn a_payout_settles_once_the_threshold_is_met() {
    let ctx = setup(3, 2, 0);
    let id = approve_to_threshold(&ctx, ctx.payout(250), 2, 0);

    ctx.vault.execute(&id);

    assert_eq!(ctx.vault.balance(&ctx.token), 750);
    assert_eq!(ctx.vault.proposal(&id).status, Status::Executed);
}

#[test]
fn a_payout_is_blocked_below_the_threshold() {
    let ctx = setup(3, 2, 0);
    let id = ctx.vault.propose(&ctx.signer(0), &ctx.payout(250));

    assert_eq!(ctx.vault.try_execute(&id), Err(Ok(Error::ThresholdNotMet)));
    assert_eq!(ctx.vault.balance(&ctx.token), 1_000);
}

/// Execution carries no auth requirement, which is what lets a fee-bump
/// relayer settle a proposal the signers never paid to submit.
#[test]
fn execution_needs_no_authorization() {
    let ctx = setup(3, 2, 0);
    let id = approve_to_threshold(&ctx, ctx.payout(100), 2, 0);

    ctx.env.set_auths(&[]);
    ctx.vault.execute(&id);

    assert_eq!(ctx.vault.proposal(&id).status, Status::Executed);
}

// ----- the timelock -----

#[test]
fn the_timelock_holds_execution_back() {
    let timelock = 3_600;
    let ctx = setup(3, 2, timelock);
    let id = ctx.vault.propose(&ctx.signer(0), &ctx.payout(100));
    ctx.vault.approve(&ctx.signer(1), &id);

    assert_eq!(ctx.vault.try_execute(&id), Err(Ok(Error::TimelockActive)));

    ctx.advance(timelock + 1);
    ctx.vault.execute(&id);
    assert_eq!(ctx.vault.balance(&ctx.token), 900);
}

#[test]
fn revoking_below_the_threshold_restarts_the_timelock() {
    let timelock = 3_600;
    let ctx = setup(3, 2, timelock);
    let id = ctx.vault.propose(&ctx.signer(0), &ctx.payout(100));
    ctx.vault.approve(&ctx.signer(1), &id);
    assert!(ctx.vault.proposal(&id).ready_at > 0);

    ctx.vault.revoke(&ctx.signer(1), &id);
    assert_eq!(ctx.vault.proposal(&id).ready_at, 0);

    // Re-approving starts the clock again from the present, not from before.
    ctx.advance(timelock + 1);
    ctx.vault.approve(&ctx.signer(1), &id);
    assert_eq!(ctx.vault.try_execute(&id), Err(Ok(Error::TimelockActive)));
}

// ----- authorization boundaries -----

#[test]
fn an_outsider_cannot_propose() {
    let ctx = setup(3, 2, 0);
    assert_eq!(
        ctx.vault.try_propose(&ctx.outsider, &ctx.payout(100)),
        Err(Ok(Error::NotSigner))
    );
}

#[test]
fn an_outsider_cannot_approve() {
    let ctx = setup(3, 2, 0);
    let id = ctx.vault.propose(&ctx.signer(0), &ctx.payout(100));
    assert_eq!(
        ctx.vault.try_approve(&ctx.outsider, &id),
        Err(Ok(Error::NotSigner))
    );
}

#[test]
fn a_signer_cannot_approve_twice() {
    let ctx = setup(3, 2, 0);
    let id = ctx.vault.propose(&ctx.signer(0), &ctx.payout(100));
    assert_eq!(
        ctx.vault.try_approve(&ctx.signer(0), &id),
        Err(Ok(Error::AlreadyApproved))
    );
}

/// The security property that makes signer rotation meaningful: an approval
/// left behind by a removed signer stops counting the moment they are gone.
#[test]
fn removing_a_signer_voids_their_pending_approval() {
    let ctx = setup(3, 2, 0);
    let compromised = ctx.signer(1);

    let payout = ctx.vault.propose(&ctx.signer(0), &ctx.payout(900));
    ctx.vault.approve(&compromised, &payout);
    assert_eq!(ctx.vault.valid_approvals(&payout), 2);

    // The remaining signers rotate the compromised key out.
    let eviction = ctx
        .vault
        .propose(&ctx.signer(0), &Action::RemoveSigner(compromised.clone()));
    ctx.vault.approve(&ctx.signer(2), &eviction);
    ctx.vault.execute(&eviction);

    assert!(!ctx.vault.is_signer(&compromised));
    assert_eq!(ctx.vault.valid_approvals(&payout), 1);
    assert_eq!(
        ctx.vault.try_execute(&payout),
        Err(Ok(Error::ThresholdNotMet))
    );
    assert_eq!(ctx.vault.balance(&ctx.token), 1_000);
}

// ----- proposal lifecycle -----

#[test]
fn a_proposal_cannot_execute_twice() {
    let ctx = setup(3, 2, 0);
    let id = approve_to_threshold(&ctx, ctx.payout(100), 2, 0);
    ctx.vault.execute(&id);

    assert_eq!(ctx.vault.try_execute(&id), Err(Ok(Error::NotPending)));
    assert_eq!(ctx.vault.balance(&ctx.token), 900);
}

#[test]
fn an_expired_proposal_cannot_execute() {
    let ctx = setup(3, 2, 0);
    let id = approve_to_threshold(&ctx, ctx.payout(100), 2, 0);

    ctx.advance(TTL + 1);

    assert_eq!(ctx.vault.try_execute(&id), Err(Ok(Error::Expired)));
}

#[test]
fn only_the_proposer_can_cancel() {
    let ctx = setup(3, 2, 0);
    let id = ctx.vault.propose(&ctx.signer(0), &ctx.payout(100));

    assert_eq!(
        ctx.vault.try_cancel(&ctx.signer(1), &id),
        Err(Ok(Error::NotProposer))
    );

    ctx.vault.cancel(&ctx.signer(0), &id);
    assert_eq!(ctx.vault.proposal(&id).status, Status::Cancelled);
    assert_eq!(ctx.vault.try_execute(&id), Err(Ok(Error::NotPending)));
}

#[test]
fn a_zero_amount_transfer_is_rejected_at_proposal_time() {
    let ctx = setup(3, 2, 0);
    assert_eq!(
        ctx.vault.try_propose(&ctx.signer(0), &ctx.payout(0)),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn proposals_paginate_oldest_first() {
    let ctx = setup(3, 2, 0);
    ctx.vault.propose(&ctx.signer(0), &ctx.payout(1));
    ctx.vault.propose(&ctx.signer(0), &ctx.payout(2));
    ctx.vault.propose(&ctx.signer(0), &ctx.payout(3));

    let page = ctx.vault.proposals(&1, &2);
    assert_eq!(page.len(), 2);
    assert_eq!(page.get(0).unwrap().id, 1);
    assert_eq!(page.get(1).unwrap().id, 2);
    assert_eq!(ctx.vault.proposal_count(), 3);
}

// ----- spend limits -----

#[test]
fn a_daily_limit_caps_payouts() {
    let ctx = setup(3, 2, 0);
    let limit = approve_to_threshold(
        &ctx,
        Action::SetDailyLimit(SpendLimit {
            token: ctx.token.clone(),
            daily_limit: 300,
        }),
        2,
        0,
    );
    ctx.vault.execute(&limit);
    assert_eq!(ctx.vault.daily_limit(&ctx.token), 300);

    let within = approve_to_threshold(&ctx, ctx.payout(200), 2, 0);
    ctx.vault.execute(&within);
    assert_eq!(ctx.vault.spent_today(&ctx.token), 200);

    let over = approve_to_threshold(&ctx, ctx.payout(200), 2, 0);
    assert_eq!(
        ctx.vault.try_execute(&over),
        Err(Ok(Error::DailyLimitExceeded))
    );
    assert_eq!(ctx.vault.balance(&ctx.token), 800);
}

#[test]
fn a_daily_limit_refreshes_the_next_day() {
    let ctx = setup(3, 2, 0);
    let limit = approve_to_threshold(
        &ctx,
        Action::SetDailyLimit(SpendLimit {
            token: ctx.token.clone(),
            daily_limit: 300,
        }),
        2,
        0,
    );
    ctx.vault.execute(&limit);

    let first = approve_to_threshold(&ctx, ctx.payout(300), 2, 0);
    ctx.vault.execute(&first);
    assert_eq!(ctx.vault.spent_today(&ctx.token), 300);

    ctx.advance(86_400);
    assert_eq!(ctx.vault.spent_today(&ctx.token), 0);

    let second = approve_to_threshold(&ctx, ctx.payout(300), 2, 0);
    ctx.vault.execute(&second);
    assert_eq!(ctx.vault.balance(&ctx.token), 400);
}

// ----- governance -----

#[test]
fn the_group_can_add_a_signer_and_raise_the_threshold() {
    let ctx = setup(3, 2, 0);
    let newcomer = Address::generate(&ctx.env);

    let add = approve_to_threshold(&ctx, Action::AddSigner(newcomer.clone()), 2, 0);
    ctx.vault.execute(&add);
    assert!(ctx.vault.is_signer(&newcomer));

    let raise = approve_to_threshold(&ctx, Action::SetThreshold(4), 2, 0);
    ctx.vault.execute(&raise);
    assert_eq!(ctx.vault.config().threshold, 4);

    // The new threshold binds immediately: three approvals no longer suffice.
    let payout = approve_to_threshold(&ctx, ctx.payout(100), 3, 0);
    assert_eq!(
        ctx.vault.try_execute(&payout),
        Err(Ok(Error::ThresholdNotMet))
    );
}

#[test]
fn a_signer_cannot_be_removed_below_the_threshold() {
    let ctx = setup(2, 2, 0);
    assert_eq!(
        ctx.vault
            .try_propose(&ctx.signer(0), &Action::RemoveSigner(ctx.signer(1))),
        Err(Ok(Error::ThresholdUnreachable))
    );
}

#[test]
fn adding_an_existing_signer_is_rejected() {
    let ctx = setup(3, 2, 0);
    assert_eq!(
        ctx.vault
            .try_propose(&ctx.signer(0), &Action::AddSigner(ctx.signer(1))),
        Err(Ok(Error::SignerExists))
    );
}

#[test]
fn the_group_can_change_its_own_timelock() {
    let ctx = setup(3, 2, 0);
    let change = approve_to_threshold(&ctx, Action::SetTimelock(7_200), 2, 0);
    ctx.vault.execute(&change);

    assert_eq!(ctx.vault.config().timelock, 7_200);

    let payout = approve_to_threshold(&ctx, ctx.payout(100), 2, 0);
    assert_eq!(
        ctx.vault.try_execute(&payout),
        Err(Ok(Error::TimelockActive))
    );
}
