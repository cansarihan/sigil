# Sigil

**A shared treasury on Stellar that only moves money when enough of your team
agrees.** Funds sit at a Soroban contract address and leave only through a
proposal that has collected `M` approvals from the current `N` signers and
cleared its timelock. There is no admin key — adding a signer and paying an
invoice travel the identical path.

Signers who hold no XLM can still take part: an optional fee-bump relayer pays
their network fees, and executing a fully-approved proposal needs no signature
at all.

```
propose ──▶ approve ×M ──▶ (timelock) ──▶ execute ──▶ tokens leave the vault
   │            │                            ▲
   └─ cancel    └─ revoke ────────────────── anyone can push this button
```

---

## Live

| | |
| --- | --- |
| **Dashboard** | _deploy via the Pages workflow, then link it here_ |
| **Testnet vault** | [`CBP4O4G5VI3UB6L5ED7R5JUNZ7QZZMWWJYLTL6GOVK6S7II4P66GTRZ5`](https://stellar.expert/explorer/testnet/contract/CBP4O4G5VI3UB6L5ED7R5JUNZ7QZZMWWJYLTL6GOVK6S7II4P66GTRZ5) |
| **Testnet config** | 2-of-3, no timelock, 7-day proposal life |
| **Wasm hash** | `e56ba9aae89c13218f86371a32528c8b19469c2898a8cfcc98b0adc8b9c990fc` |
| **Mainnet vault** | _not yet deployed — see [deployment](docs/deployment.md)_ |

End-to-end on testnet, including a payout settled by a **non-signer relayer**:

| Step | Transaction |
| --- | --- |
| Deploy | [`d951d46d…`](https://stellar.expert/explorer/testnet/tx/d951d46dbdca4bf674806185bc755f7bff8537a4a80bce5227c85b17e7fb822a) |
| Propose | [`1889a4d9…`](https://stellar.expert/explorer/testnet/tx/1889a4d92b8f1455647bb10020ae9281f95da16607fefff43525d706dd0a6a83) |
| Execute, submitted by a non-signer | [`9e66bdf2…`](https://stellar.expert/explorer/testnet/tx/9e66bdf25ea0898cc8ccb1bd87fcf448e9cebffbf959219a1ce83c9987806f06) |
| **Gasless settlement — relayer built, signed and paid for it; no signer involved** | [`1a21f994…`](https://stellar.expert/explorer/testnet/tx/1a21f994ff2b430712882cfe3617a053f58bdc316343dada94cf1057d4d59460) |

## Advanced features

Level 6 asks for one. Sigil implements two.

**Multi-signature logic.** M-of-N approval over every action, with a timelock
between agreement and execution, per-token daily spending caps, and — the part
that makes key rotation real — approvals re-counted against the *live* signer
set at execution time. Removing a compromised signer instantly voids every
approval they left behind.

**Fee sponsorship.** A relayer wraps a signer's transaction in a Stellar
fee-bump envelope and pays for it. Because `execute` carries no `require_auth`,
the relayer can also build and pay for that step outright, so a fully-approved
payout settles with no user signature and no user XLM. The relayer refuses
anything outside a single-operation invocation of this vault's own methods, with
a fee ceiling, per-account rate limit and daily budget on top.

Why leaving that `require_auth` out is safe, and what it costs, is written up in
[the technical note](docs/blog/gasless-multisig-on-stellar.md).

## Quick start

```bash
rustup target add wasm32v1-none
cargo install --locked stellar-cli
npm ci

cargo test                    # 28 contract tests
npm test                      # 35 relayer and dashboard tests
./scripts/build.sh            # builds the wasm and prints its hash
```

Run the dashboard against the testnet vault:

```bash
cp web/.env.example web/.env
npm run web                   # http://localhost:5173
```

Run the relayer (optional — only needed for gasless signing):

```bash
cp relayer/.env.example relayer/.env   # then set SIGIL_SPONSOR_SECRET
npm run build --workspace relayer && npm run relayer
```

Deploy your own vault:

```bash
./scripts/deploy.sh testnet <source-key> 2 3600 GA... GB... GC...
```

## Layout

| Path | What lives there |
| --- | --- |
| `contracts/vault` | The Soroban contract. Rust, `no_std`, ~400 lines. |
| `packages/sigil-vault-client` | TypeScript client generated from the deployed spec. |
| `relayer` | Fee-sponsorship service. Node, TypeScript. |
| `web` | Static dashboard. React, Vite, Freighter. |
| `scripts` | Build, deploy and binding-generation scripts. |
| `docs` | Everything below. |

## Documentation

| | |
| --- | --- |
| [Architecture](docs/architecture.md) | How the three pieces fit, and the three decisions behind them |
| [Security review](docs/security.md) | Threat model, invariants, findings, and what has *not* been verified |
| [Deployment](docs/deployment.md) | Testnet rehearsal through mainnet runbook and rollback |
| [User guide](docs/user-guide.md) | For signers, in the dashboard and on the CLI |
| [Technical note](docs/blog/gasless-multisig-on-stellar.md) | Gasless multisig on Stellar |
| [User onboarding](docs/onboarding/README.md) | Feedback form spec and verification method |

## Testing

63 tests, all run in CI on every push.

| Suite | Count | Covers |
| --- | --- | --- |
| `cargo test` | 28 | Threshold, timelock, expiry, rotation, spend caps, governance, re-entrancy ordering |
| `relayer` | 16 | What the sponsor will and will not pay for; daily and per-account spend limits |
| `web` | 19 | Exact amount handling; which lane a proposal belongs in |

CI additionally enforces `rustfmt`, `clippy -D warnings`, TypeScript strict mode
and `npm audit --audit-level=high`, and prints the wasm hash so a reviewer can
compare it against what is deployed.

## User onboarding

Feedback drives what gets built next. The form spec, the verification method
and the export instructions are in [`docs/onboarding`](docs/onboarding/README.md).

| | |
| --- | --- |
| **Feedback form** | _add the Google Form link here once created_ |
| **Exported responses** | _add `docs/onboarding/responses.xlsx` once responses arrive_ |
| **Form responses** | 0 |
| **Verified mainnet users** | 0 — mainnet deployment is pending |
| **Mainnet transactions** | 0 |

A response only counts as a verified user when the wallet address in the form
also appears in the vault's on-chain events. The method is in the onboarding
doc.

### What we are building next

Changes made in response to what testing and review actually surfaced, each
linked to the commit that shipped it:

| Finding | Change | Commit |
| --- | --- | --- |
| The dashboard asked signers to approve proposals that had already reached quorum, so the "needs you" lane cried wolf | Quorum-met proposals moved to the waiting lane; regression test added | [`4fa51c4`](../../commit/4fa51c4), [`1503807`](../../commit/1503807) |
| The wallet aggregator pulled the entire Solana SDK into a Stellar app, with 32 advisories | Replaced with `@stellar/freighter-api`; the tree now audits clean | [`29627f4`](../../commit/29627f4) |
| Assuming 7 decimals would render a USDC payment a hundredfold too large | Token symbol and decimals read from the chain before any amount is shown | [`5add1c4`](../../commit/5add1c4) |
| A relayer allowlist of signer addresses would keep paying for an evicted key | Signer status checked against the live contract on every request | [`1cbf336`](../../commit/1cbf336) |

Once the form has responses, each recurring theme becomes an issue, and the
commit that closes it is added to this table.

## Status

Honest about what is done and what is not.

| Requirement | Status |
| --- | --- |
| Public repository | ✅ |
| 30+ meaningful commits | ✅ |
| Contract on testnet, verified end to end | ✅ |
| Advanced feature — multi-signature logic | ✅ |
| Advanced feature — fee sponsorship | ✅ |
| Technical documentation | ✅ |
| User guide | ✅ |
| Security review document | ✅ written; ⏳ awaiting mentor sign-off |
| Technical blog post | ✅ written; ⏳ awaiting publication |
| Mainnet deployment | ⏳ [runbook ready](docs/deployment.md) |
| 20+ verified mainnet users | ⏳ needs mainnet |
| Feedback form and export | ⏳ [spec ready](docs/onboarding/README.md) |
| Launch post on X | ⏳ |
| Demo video | ⏳ |

## Licence

Apache-2.0. See [LICENSE](LICENSE).
