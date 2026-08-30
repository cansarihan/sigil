use soroban_sdk::{Address, Env};

use crate::types::{Config, DataKey, Error, Proposal};

const DAY_IN_LEDGERS: u32 = 17_280;

const INSTANCE_THRESHOLD: u32 = DAY_IN_LEDGERS * 30;
const INSTANCE_EXTEND: u32 = DAY_IN_LEDGERS * 90;

const PERSISTENT_THRESHOLD: u32 = DAY_IN_LEDGERS * 30;
const PERSISTENT_EXTEND: u32 = DAY_IN_LEDGERS * 90;

/// Spend buckets are keyed by day, so two days of life is always enough.
const SPEND_EXTEND: u32 = DAY_IN_LEDGERS * 2;

pub fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_EXTEND);
}

/// The constructor always writes a config, so a missing one means the
/// instance entry has been archived — unrecoverable, and not a user error.
pub fn read_config(env: &Env) -> Config {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .expect("vault config missing: instance storage archived")
}

pub fn write_config(env: &Env, config: &Config) {
    env.storage().instance().set(&DataKey::Config, config);
}

/// Reserves and returns the next proposal id.
pub fn take_next_id(env: &Env) -> u32 {
    let id: u32 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
    env.storage().instance().set(&DataKey::NextId, &(id + 1));
    id
}

pub fn peek_next_id(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
}

pub fn read_proposal(env: &Env, id: u32) -> Result<Proposal, Error> {
    let key = DataKey::Proposal(id);
    match env.storage().persistent().get::<_, Proposal>(&key) {
        Some(proposal) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_EXTEND);
            Ok(proposal)
        }
        None => Err(Error::ProposalNotFound),
    }
}

pub fn try_read_proposal(env: &Env, id: u32) -> Option<Proposal> {
    env.storage().persistent().get(&DataKey::Proposal(id))
}

pub fn write_proposal(env: &Env, proposal: &Proposal) {
    let key = DataKey::Proposal(proposal.id);
    env.storage().persistent().set(&key, proposal);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_EXTEND);
}

pub fn read_limit(env: &Env, token: &Address) -> i128 {
    let key = DataKey::Limit(token.clone());
    match env.storage().persistent().get::<_, i128>(&key) {
        Some(limit) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_EXTEND);
            limit
        }
        None => 0,
    }
}

pub fn write_limit(env: &Env, token: &Address, limit: i128) {
    let key = DataKey::Limit(token.clone());
    env.storage().persistent().set(&key, &limit);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_EXTEND);
}

pub fn read_spent(env: &Env, token: &Address, day: u64) -> i128 {
    env.storage()
        .temporary()
        .get(&DataKey::Spent(token.clone(), day))
        .unwrap_or(0)
}

pub fn write_spent(env: &Env, token: &Address, day: u64, amount: i128) {
    let key = DataKey::Spent(token.clone(), day);
    env.storage().temporary().set(&key, &amount);
    env.storage()
        .temporary()
        .extend_ttl(&key, SPEND_EXTEND, SPEND_EXTEND);
}
