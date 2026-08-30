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
| **Dashboard** | **<https://cansarihan.github.io/sigil/>** |
| **Testnet vault** | [`CB6IEZRJHZ7PAZAUNEEPIWZIBT2YGQ3RV433EPHYWG3CEE657H6K5OSQ`](https://stellar.expert/explorer/testnet/contract/CB6IEZRJHZ7PAZAUNEEPIWZIBT2YGQ3RV433EPHYWG3CEE657H6K5OSQ) |
| **Testnet config** | 2-of-3, no timelock, 7-day proposal life |
| **Wasm hash** | `878cf13aca799812627c17e4faab4dddafe98244d08082c24f701205455ffc8b` |
| **Mainnet vault** | _not yet deployed — see [deployment](docs/deployment.md)_ |

End-to-end on testnet, ending in a payout the **relayer paid for entirely**:

| Step | Transaction |
| --- | --- |
| Deploy | [`e711b98e…`](https://stellar.expert/explorer/testnet/tx/e711b98e73943a479f978fbdebc1ece6766b7ae3b8e2bfb150c3e3db9ccbdf3f) |
| Deposit 100 XLM | [`3278628a…`](https://stellar.expert/explorer/testnet/tx/3278628aae99066239bf950b05994c919dbd48787df5632f64af9f7c4406548a) |
| Propose a 5 XLM payout | [`d4fa8a73…`](https://stellar.expert/explorer/testnet/tx/d4fa8a73345396ec3e1bf0751678b15fe55f4d8016716c9b453541e9b9a45e04) |
| Second approval, reaching quorum | [`03b9cbe3…`](https://stellar.expert/explorer/testnet/tx/03b9cbe3c828c21e58a74d595560b0f3bee5ecc9d39e13e7ea57a66261161c65) |
| **Gasless settlement — the relayer built, signed and paid for it; no signer involved** | [`4ce8be77…`](https://stellar.expert/explorer/testnet/tx/4ce8be77de4c90db25326780ba0659973ca413099392498c544ea8572e79a5ad) |

The deployed contract is verifiably this source. All three hashes agree:

```
local  ./scripts/build.sh                                878cf13a…455ffc8b
CI     every run prints it                               878cf13a…455ffc8b
chain  stellar contract fetch --id <VAULT> --network testnet | shasum -a 256
                                                         878cf13a…455ffc8b
```

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
