use soroban_sdk::{contracterror, contracttype, Address, Vec};

/// Upper bound on the signer set. Keeps `execute` cost bounded and predictable:
/// every approval is re-validated against the live signer set on execution.
pub const MAX_SIGNERS: u32 = 20;

/// Seconds in a spend-limit bucket. Limits are enforced per UTC day.
pub const SPEND_WINDOW: u64 = 86_400;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Caller is not part of the current signer set.
    NotSigner = 1,
    /// threshold must satisfy 1 <= threshold <= signers.len()
    InvalidThreshold = 2,
    /// The same address appears twice in the signer set.
    DuplicateSigner = 3,
    /// Signer set is empty or larger than MAX_SIGNERS.
    InvalidSignerSet = 4,
    /// No proposal exists with this id.
    ProposalNotFound = 5,
    /// This signer has already approved the proposal.
    AlreadyApproved = 6,
    /// This signer has no approval to revoke.
    NotApproved = 7,
    /// Proposal is not in the Pending state.
    NotPending = 8,
    /// Valid approvals are below the current threshold.
    ThresholdNotMet = 9,
    /// Threshold is met but the timelock has not elapsed.
    TimelockActive = 10,
    /// Proposal passed its expiry without being executed.
    Expired = 11,
    /// Only the proposer may cancel their own proposal.
    NotProposer = 12,
    /// Transfer amounts must be strictly positive.
    InvalidAmount = 13,
    /// Executing this transfer would breach the token's daily limit.
    DailyLimitExceeded = 14,
    /// Address is already a signer.
    SignerExists = 15,
    /// Address is not a signer, so it cannot be removed.
    SignerMissing = 16,
    /// Removing this signer would leave fewer signers than the threshold.
    ThresholdUnreachable = 17,
    /// Spend limits and TTLs must be non-negative / non-zero as documented.
    InvalidConfig = 18,
}

/// A treasury payout. `token` is any SEP-41 / Stellar Asset Contract address.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Transfer {
    pub token: Address,
    pub to: Address,
    pub amount: i128,
}

/// A per-token rolling daily cap. `daily_limit == 0` means "no cap".
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpendLimit {
    pub token: Address,
    pub daily_limit: i128,
}

/// Everything the vault can be asked to do. Governance changes go through the
/// exact same M-of-N path as payouts — there is no privileged admin address.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Action {
    Transfer(Transfer),
    AddSigner(Address),
    RemoveSigner(Address),
    SetThreshold(u32),
    SetDailyLimit(SpendLimit),
    SetTimelock(u64),
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Status {
    Pending,
    Executed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u32,
    pub proposer: Address,
    pub action: Action,
    /// Raw approval log. May contain addresses that have since been removed
    /// from the signer set, so it is never trusted as a count on its own.
    pub approvals: Vec<Address>,
    pub status: Status,
    pub created_at: u64,
    /// Ledger time at which execution becomes legal. `0` = threshold not met.
    pub ready_at: u64,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub signers: Vec<Address>,
    pub threshold: u32,
    /// Delay between reaching the threshold and becoming executable.
    pub timelock: u64,
    /// Lifetime of a proposal from creation to expiry.
    pub proposal_ttl: u64,
}

#[contracttype]
pub enum DataKey {
    Config,
    NextId,
    Proposal(u32),
    /// token -> daily cap
    Limit(Address),
    /// (token, day bucket) -> amount already spent
    Spent(Address, u64),
}
