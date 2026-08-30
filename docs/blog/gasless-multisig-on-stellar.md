# Gasless multisig on Stellar: fee bumps, and the `require_auth` you should leave out

*A build note from Sigil, an M-of-N treasury vault on Soroban.*

Multisig has an onboarding problem that has nothing to do with multisig. You add
your co-founder as a signer, they open the dashboard, they click Approve — and
the wallet tells them they cannot afford the transaction. The vault holds
money. They do not. Nothing about the treasury is broken; the person who is
supposed to guard it simply has an empty account.

Stellar has had the fix since Protocol 13. It is worth knowing exactly what it
does and, more usefully, what it does *not* cover — because the second half is
where a design decision hides.

## What a fee bump actually is

A fee-bump transaction is an envelope around a transaction someone else already
signed:

```
FeeBumpTransaction
├── feeSource: GSPONSOR…      ← pays, and signs the outer envelope
├── fee: 400000 stroops
└── innerTransaction
    ├── sourceAccount: GUSER…  ← authorizes, and signs the inner transaction
    └── operations: [invokeHostFunction → vault.approve(GUSER, 4)]
```

Two signatures over two different payloads. The sponsor's signature covers the
envelope and the fee. The user's covers the operation. The sponsor cannot
change the operation without invalidating the inner signature, and the user
cannot make the sponsor pay for anything the sponsor did not wrap.

In JavaScript that is one call:

```ts
const bump = TransactionBuilder.buildFeeBumpTransaction(
  sponsorKeypair,
  String(baseFee),          // must be at least the inner fee
  innerTx,                  // already signed by the user
  networkPassphrase,
);
bump.sign(sponsorKeypair);
await rpc.sendTransaction(bump);
```

The gotcha in that snippet is the fee argument. A fee bump *replaces* the inner
fee rather than adding to it, and `stellar-base` refuses to build one whose bid
is below the inner transaction's. So the sponsor's configured fee is a floor,
not a price:

```ts
const bid = Math.max(configuredFee, innerTx.fee);
```

Get that wrong and your relayer works perfectly in testing — where every inner
fee is the 100-stroop default — and throws the first time a real client sets a
higher fee to beat congestion.

## The half that fee bumps do not solve

A fee bump needs an inner transaction, and an inner transaction needs a source
account with a sequence number. On Stellar that means an account that exists,
and an account that exists has posted the base reserve. So "gasless" here means
*no XLM for fees*, not *no XLM at all*. Someone still had to create the account.

That is fine for a treasury — you are onboarding colleagues, not anonymous
users — but it is worth saying plainly, because "gasless" in other ecosystems
implies something stronger.

## The design decision: leave `require_auth` out

Here is where a Soroban contract can do better than a generic relayer.

A multisig payout has three steps: propose, approve, execute. The first two are
statements about who agrees, and they must be authenticated — only a signer may
make them. But what is `execute`?

The naive version authenticates it too:

```rust
pub fn execute(env: Env, caller: Address, id: u32) -> Result<(), Error> {
    caller.require_auth();
    require_signer(&config, &caller)?;
    // ...
}
```

This looks careful and is actually worse. Consider what `execute` can do that
the proposal's own state does not already permit. It can transfer funds — but
only the exact transfer that `threshold` signers already approved, only after
the timelock, only once, only before expiry. Every one of those conditions is
stored on the proposal. None of them depends on the caller.

The `require_auth` adds no authority. What it adds is a dependency: now the
payment waits for a *particular* person to be online, with XLM, at the moment
the timelock expires.

So leave it out:

```rust
/// Deliberately permissionless: the gate is the proposal state, not the caller.
pub fn execute(env: Env, id: u32) -> Result<(), Error> {
    let config = storage::read_config(&env);
    let mut proposal = storage::read_proposal(&env, id)?;
    require_open(&env, &proposal)?;

    if count_valid_approvals(&config, &proposal.approvals) < config.threshold {
        return Err(Error::ThresholdNotMet);
    }
    if proposal.ready_at == 0 || env.ledger().timestamp() < proposal.ready_at {
        return Err(Error::TimelockActive);
    }
    // ...
}
```

Now the relayer does not need to *sponsor* execution. It can perform it: build,
sign and pay for the whole transaction, with no round trip to a user's wallet.
The signer with an empty account approves once, and the payment settles without
them ever touching a fee.

It also removes a liveness failure. A proposal that everyone has approved is
never stuck behind one person's laptop being shut.

## The cost of counting approvals twice

Permissionless execution is only safe if the proposal's stored state is
genuinely sufficient. That puts weight on one detail that is easy to get wrong.

An approval log is a list of addresses. The obvious check is `approvals.len() >=
threshold`. It is wrong, and the bug it creates is exactly the one multisig
exists to prevent.

Suppose Bob's key is compromised. Bob has already approved a large payout. The
remaining signers do the right thing and vote Bob out of the signer set. With a
length check, Bob's approval is still sitting in the log, still counting — and
the attacker executes the payout after Bob has been removed.

So the count has to be an intersection, evaluated at execution time:

```rust
fn count_valid_approvals(config: &Config, approvals: &Vec<Address>) -> u32 {
    let mut valid = 0;
    for approver in approvals.iter() {
        if config.signers.contains(&approver) {
            valid += 1;
        }
    }
    valid
}
```

The approval log is history. The signer set is authority. Removing a signer
retroactively voids their pending approvals, which is what makes key rotation
mean something rather than being a cosmetic gesture.

The test that pins this down is the most valuable one in the suite:

```rust
#[test]
fn removing_a_signer_voids_their_pending_approval() {
    let ctx = setup(3, 2, 0);
    let compromised = ctx.signer(1);

    let payout = ctx.vault.propose(&ctx.signer(0), &ctx.payout(900));
    ctx.vault.approve(&compromised, &payout);
    assert_eq!(ctx.vault.valid_approvals(&payout), 2);

    let eviction = ctx.vault.propose(&ctx.signer(0), &Action::RemoveSigner(compromised.clone()));
    ctx.vault.approve(&ctx.signer(2), &eviction);
    ctx.vault.execute(&eviction);

    assert_eq!(ctx.vault.valid_approvals(&payout), 1);
    assert_eq!(ctx.vault.try_execute(&payout), Err(Ok(Error::ThresholdNotMet)));
}
```

## What a relayer must refuse

A sponsor's signature on a fee bump is an unconditional promise to pay. There is
no simulation step that saves you and no way to take it back. So the relayer's
job is mostly saying no, and it should say no *before* any network call:

- **Not a fee bump already.** Nesting hides the real payload one layer down.
- **Exactly one operation.** A batch could pair a sponsored vault call with an
  unrelated payment out of the source account.
- **`invokeHostFunction` only**, against *this* contract id, calling one of the
  handful of methods you meant to sponsor.
- **Already signed.** An unsigned inner transaction cannot succeed, so paying
  for it burns the fee for nothing.
- **Fee under a ceiling**, since you are absorbing it.

Then one check that has to happen against the chain rather than a config file:
is the source account *currently* a signer? Asking the contract, rather than
keeping a local allowlist, means an evicted key stops being sponsored the
instant it is evicted. The same intersection principle as above, one layer out.

Finally, bound the spend. A per-account rate limit stops one user draining the
sponsor; a daily fee budget stops all of them together. Both are cheap. Neither
is a substitute for funding the sponsor account with an amount you would not
mind losing — if the guard is in process memory, replicas multiply it, and the
account balance is the only ceiling that is actually real.

## In short

- Fee bumps let one account pay for another's transaction without gaining any
  authority over it. The outer fee must be at least the inner one.
- "Gasless" means no XLM for fees. The account still has to exist.
- Ask whether each entry point's `require_auth` grants authority the stored
  state does not already imply. If it does not, it is a liveness cost with no
  security benefit — and removing it is what makes true gasless settlement
  possible.
- If execution is permissionless, the stored state carries the entire security
  argument. Count approvals against the *current* signer set, every time.

---

Sigil is Apache-2.0: <https://github.com/cansarihan/sigil>. The contract is
about 400 lines of Rust; the relayer is under 300 lines of TypeScript. Both are
worth reading before you trust either.
