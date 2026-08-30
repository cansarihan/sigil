# Security review

This is a self-review written by the people who built Sigil. It is the input to
a mentor or third-party sign-off, not a substitute for one. Anything unverified
says so.

- **Contract:** `contracts/vault`, `soroban-sdk 27.0.6`
- **Reviewed wasm hash:** `878cf13aca799812627c17e4faab4dddafe98244d08082c24f701205455ffc8b`,
  reproducible from `./scripts/build.sh` with the pinned toolchain, and printed
  by every CI run
- **Automated coverage:** 28 contract tests, 16 relayer tests, 19 dashboard tests
- **External audit:** not yet commissioned

## Threat model

Sigil holds tokens for a small group. The assets worth attacking are the vault
balance and the signer set that controls it.

| Adversary | Wants | What stops them |
| --- | --- | --- |
| Outsider | Move funds | `propose` and `approve` reject non-signers |
| One compromised signer | Move funds alone | Threshold ≥ 2 means one key is never enough |
| One compromised signer | Race the rotation | Removing them voids their pending approvals |
| Malicious token contract | Re-enter and double-spend | Status written before the external call |
| Anyone | Drain the relayer | Method/contract allowlist, fee ceiling, rate limit, daily budget |
| Relayer operator | Alter what they sponsor | They add an outer envelope; the inner signature is the user's |

Explicitly **not** defended against: a quorum of signers acting against the
group. If `threshold` signers agree, the funds move. That is the product.

## Invariants and where they are enforced

| # | Invariant | Enforced | Tested |
| --- | --- | --- | --- |
| 1 | `1 ≤ threshold ≤ signers.len()` | `check_threshold`, on construction and on every change | ✅ |
| 2 | Signer set has no duplicates | `validate_signer_set`, `check_addable` | ✅ |
| 3 | Only current signers may propose or approve | `require_signer` | ✅ |
| 4 | A signer approves at most once | `approvals.contains` | ✅ |
| 5 | Only approvals from current signers count | `count_valid_approvals`, re-run in `execute` | ✅ |
| 6 | Execution requires threshold, timelock and non-expiry | `execute` | ✅ |
| 7 | A proposal executes at most once | Status set before the external call | ✅ |
| 8 | Removing a signer cannot strand the threshold | `apply` re-checks after removal | ✅ |
| 9 | Daily caps are charged at execution, not proposal | `charge_daily_limit` | ✅ |
| 10 | Only the proposer cancels | `cancel` | ✅ |

## Findings

### 1 — Stale approvals after signer rotation · addressed

Counting `approvals.len()` would let a removed signer's approval keep carrying
a proposal, so evicting a compromised key would not actually revoke their
influence. `execute` intersects the log with the live signer set instead.
Covered by `removing_a_signer_voids_their_pending_approval`.

### 2 — Re-entrancy through a hostile token · addressed

`execute` transfers by calling an arbitrary contract address. The proposal is
marked `Executed` and persisted before that call, so a callback finds a closed
proposal and fails on `NotPending`.

### 3 — Governance changes applied to stale state · addressed

A proposal may sit for days while the config moves. Every branch of `apply`
re-checks its own preconditions at execution rather than trusting the check
made at proposal time.

### 4 — Arithmetic overflow · addressed

`overflow-checks = true` is set on the release profile, so `i128` addition in
the spend counter traps rather than wrapping. This is off by default in release
builds and is easy to lose in a profile edit — treat it as load-bearing.

### 5 — Relayer paying for transactions it did not intend · addressed

A fee-bump signature is an unconditional promise to pay. `inspect` refuses
anything it does not recognise: multiple operations, non-invoke operations, a
different contract, an unlisted method, an unsigned envelope, a nested fee
bump, or a fee over the ceiling. Signer-only methods are additionally checked
against the live signer set on chain.

### 6 — Relayer budget is per-process · accepted

`SpendGuard` is in-memory, so N replicas allow N times the budget. The real
bound on loss is the sponsor account's balance. Run one instance, or fund the
sponsor for the worst case.

### 7 — `ready_at` after a threshold decrease · accepted

Lowering the threshold can leave an older proposal eligible but still stamped
`ready_at == 0`, which `execute` refuses as timelocked. It fails closed. Any
signer clears it by revoking and re-approving.

### 8 — Instance storage archival · accepted

Every entry point extends the instance TTL, so an active vault never archives.
A vault untouched past its TTL needs its instance entry restored before use;
funds are unaffected. Documented in the deployment guide.

### 9 — Mainnet signer keys share one machine · accepted, and it matters

The first mainnet vault is configured 2-of-3, but all three signer keys were
generated on and are stored on a single machine. An attacker with that machine
has every key, so the vault's real security is 1-of-1 — the threshold is a
costume.

This is a deliberate choice for a launch vault holding a small float, not a
recommendation. A vault holding money worth stealing needs each key on a
separate device held by a separate person, which is the entire reason M-of-N
exists. Rotating a key onto its own device is itself a proposal
(`AddSigner` / `RemoveSigner`) and needs no redeploy.

### 10 — No emergency pause · by design

There is no pause switch, because a pause switch is an address that can freeze
everyone else's money. The timelock is the equivalent control: it gives the
group a window to notice a hostile proposal and revoke.

## What has not been verified

- No third-party audit has been performed.
- No fuzzing or formal verification; coverage is example-based tests.
- The relayer has not been load-tested, and its rate limiting has not been
  tested against a distributed source of requests.
- Mainnet behaviour is untested. Everything below has been exercised on
  testnet only.

## Reproducing this review

```bash
cargo test                                  # 28 contract tests
npm test                                    # 35 relayer and dashboard tests
cargo clippy --all-targets -- -D warnings
./scripts/build.sh                          # prints the wasm hash to compare
```

## Sign-off

| Reviewer | Role | Date | Outcome |
| --- | --- | --- | --- |
| _pending_ | Stellar mentor | | |
