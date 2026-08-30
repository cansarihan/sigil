use soroban_sdk::{contractevent, Address};

/// Tokens arrived through `deposit`. Direct transfers to the vault address
/// bypass this, which is why the UI reconciles against `balance` as well.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deposited {
    #[topic]
    pub token: Address,
    #[topic]
    pub from: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposed {
    #[topic]
    pub id: u32,
    pub proposer: Address,
    pub expires_at: u64,
}

/// `valid` is the approval count measured against the live signer set, which
/// is the number that actually decides whether the proposal can execute.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Approved {
    #[topic]
    pub id: u32,
    pub signer: Address,
    pub valid: u32,
    pub threshold: u32,
    pub ready_at: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Revoked {
    #[topic]
    pub id: u32,
    pub signer: Address,
    pub valid: u32,
    pub threshold: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Cancelled {
    #[topic]
    pub id: u32,
    pub signer: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Executed {
    #[topic]
    pub id: u32,
    pub proposer: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfigChanged {
    pub signer_count: u32,
    pub threshold: u32,
    pub timelock: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LimitChanged {
    #[topic]
    pub token: Address,
    pub daily_limit: i128,
}
