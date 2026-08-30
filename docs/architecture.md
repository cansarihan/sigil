# Architecture

Sigil is a treasury that will not move money until enough of the right people
agree. Three pieces make that true, and each one is replaceable without the
others noticing.

```
  Freighter ──signs──▶ Dashboard ──┬── reads ──▶ Soroban RPC ──▶ sigil-vault
   (browser)             (static)  │                               (Wasm)
                                   │
                                   └── posts signed XDR ──▶ Relayer ──pays fee──┘
                                                          (Node, optional)
```

- **`contracts/vault`** holds the money and every rule about moving it.
- **`web`** is a static dashboard. It has no backend and no database; every
  number it shows is read from the chain at page load.
- **`relayer`** is optional. It pays network fees for signers who hold no XLM.
  Turn it off and the product still works — signers just pay their own fees.

## The contract

### State

| Key | Storage | Holds |
| --- | --- | --- |
| `Config` | instance | signer set, threshold, timelock, proposal lifetime |
| `NextId` | instance | the next proposal id |
| `Proposal(id)` | persistent | one proposal and its approval log |
| `Limit(token)` | persistent | a token's daily cap; `0` means uncapped |
| `Spent(token, day)` | temporary | how much of that cap today has used |

Spend counters are the only temporary entries. They are keyed by day bucket and
never read outside their own day, so a two-day TTL is always sufficient and the
entries clean themselves up.

### The path money takes

```
propose ──▶ approve ×N ──▶ (threshold met, timelock starts) ──▶ execute
   │            │                                                  │
   └─ cancel    └─ revoke  (drops below threshold, timelock resets) │
                                                                    ▼
                                                          tokens leave the vault
```

`execute` re-derives every condition from stored state. Nothing that happened
during approval is trusted to still be true.

### Three decisions worth explaining

**There is no admin.** Adding a signer, lowering the threshold and paying an
invoice are all `Action` values travelling the same propose/approve/execute
path. A contract with an admin key has a single address whose compromise is
fatal; this one does not have that address at all.

**Approvals are counted at execution, against the live signer set.** The
approval log is history. `execute` intersects it with the current signers, so
the moment a compromised key is removed, every approval it left behind stops
counting. Without this, evicting a signer would be cosmetic: their old
approvals would still be carrying proposals over the line.

**Execution is permissionless.** `execute` takes no `require_auth`. The gate is
the proposal's own state — enough valid approvals, timelock elapsed, not
expired, not already closed — and none of those depend on who is calling. This
is what lets the relayer settle a payout for a signer with an empty wallet, and
it means a stuck proposal can always be pushed through by anyone.

### Ordering inside `execute`

The proposal is marked `Executed` and written to storage *before* the token
transfer. Tokens are arbitrary contracts; a hostile one that calls back into
the vault finds a proposal that is already closed.

### A known rough edge

`ready_at` is stamped when the threshold is first met. If the group later
*lowers* the threshold, an older proposal can satisfy the new threshold while
still carrying `ready_at == 0`, and `execute` will refuse it as timelocked.
Any signer can clear this by revoking and re-approving, which re-stamps
`ready_at`. It fails closed, so it is a nuisance rather than a risk.

## The relayer

A Stellar fee-bump transaction wraps a transaction someone else signed and
pays for it. The inner signature is untouched, so the relayer can pay without
gaining any authority over what it pays for.

Two paths:

1. **`POST /sponsor`** — the user signs a vault call in their wallet and posts
   the envelope. The relayer inspects it, wraps it, pays, submits.
2. **`POST /execute`** — no user signature at all. Because `execute` is
   permissionless, the relayer builds and signs the whole transaction itself.

Before it agrees to pay, the relayer checks the envelope offline: it must be a
single `invokeHostFunction` operation, against this one vault contract, calling
one of five allowed methods, already signed, with a fee under the ceiling. For
the four signer-only methods it also asks the contract whether the source
account is currently a signer, so an evicted key stops being sponsored the
instant it is evicted — no allowlist to keep in sync.

Spend is bounded twice: a per-account rate limit and a daily fee budget. Both
live in process memory, so several replicas multiply the budget. The ceiling
that actually bounds the loss is the balance of the sponsor account, which is
why the deployment guide says to fund it with an amount you would not mind
losing.

## The dashboard

The one screen answers one question: *what needs me?* Proposals are sorted into
four lanes — waiting for your approval, ready to execute, collecting approvals,
closed — and the first lane is the reason to open the page.

A proposal that has already reached quorum is not in your lane even if you
have not signed it, because your signature would change nothing; it is waiting
on the clock.

Amounts are never rendered until the token's own `decimals` has been read from
the chain. A hard-coded seven would display a USDC payment a hundred times too
large.

The client is generated from the deployed contract's spec (`scripts/bindings.sh`),
so the app's types are the chain's types, and the named errors the contract
declares reach the UI instead of raw status codes.
