# Deployment

Testnet is a rehearsal you can repeat. Mainnet spends real XLM and cannot be
undone. Do the whole run on testnet first, with the same threshold and timelock
you intend to use in production.

## Prerequisites

```bash
rustup target add wasm32v1-none
cargo install --locked stellar-cli      # 26.0.0 or newer
node --version                          # 20 or newer
npm ci
```

## 1. Decide the configuration before you deploy

The constructor arguments are permanent starting conditions. They can all be
changed later, but only by a proposal that already meets the threshold you set
now — so a bad threshold is awkward to fix and an unreachable one is fatal.

| Argument | Question it answers | Guidance |
| --- | --- | --- |
| `signers` | Who can propose and approve? | Distinct keys on distinct devices. Fewer than you think. |
| `threshold` | How many must agree? | Never 1 in production. `2` of `3` survives losing one key. |
| `timelock` | How long between agreement and payment? | `0` for a fast desk, `3600`+ if you want a window to object. |
| `proposal_ttl` | How long before an unexecuted proposal dies? | `604800` (a week) suits most groups. |

Sanity check: can you still reach `threshold` if one signer loses their key
tomorrow? If not, add a signer or lower the threshold now.

## 2. Rehearse on testnet

```bash
for k in signer-1 signer-2 signer-3; do
  stellar keys generate --network testnet --fund "$k"
done

./scripts/deploy.sh testnet signer-1 2 0 \
  "$(stellar keys address signer-1)" \
  "$(stellar keys address signer-2)" \
  "$(stellar keys address signer-3)"
```

Then walk the full loop — deposit, propose, approve, execute — and confirm the
balance moved. `docs/user-guide.md` has the commands.

## 3. Deploy to mainnet

Fund the deploying account with about 10 XLM. Deployment costs well under that;
the surplus covers retries.

```bash
stellar keys add sigil-deployer --secret-key      # paste the secret, never commit it
./scripts/deploy.sh mainnet sigil-deployer 2 3600 GA... GB... GC...
```

The script asks you to type `deploy mainnet` before it proceeds. Record the
contract id it prints — that is the vault.

Verify what you deployed matches this repository:

```bash
./scripts/build.sh                                  # prints the local sha256
stellar contract info interface --network mainnet --id <CONTRACT_ID>
```

The hash from `build.sh` should equal the one in the CI run for the commit you
deployed from.

## 4. Fund the vault

Send tokens to the contract address like any other Stellar address, or use
`deposit` so the transfer emits an event the dashboard can show:

```bash
stellar contract invoke --id <CONTRACT_ID> --source sigil-deployer --network mainnet -- \
  deposit --from <YOUR_ADDRESS> --token <TOKEN_CONTRACT_ID> --amount <BASE_UNITS>
```

Amounts are in base units. XLM has 7 decimals, so 10 XLM is `100000000`.

**Move a small amount first and complete one full payout with it.** A vault you
have not withdrawn from is a vault you have not tested.

## 5. Set a daily limit

A cap turns a compromised quorum from a total loss into a bounded one. It is a
governance proposal like any other:

```bash
stellar contract invoke --id <CONTRACT_ID> --source signer-1 --network mainnet -- \
  propose --proposer <SIGNER_1> \
  --action '{"SetDailyLimit":{"token":"<TOKEN_ID>","daily_limit":"<BASE_UNITS>"}}'
```

Approve it to threshold, then execute. `0` means uncapped, which is the default.

## 6. Publish the dashboard

The Pages workflow deploys on every push to `main`. Set these as repository
variables under Settings → Secrets and variables → Actions → Variables:

| Variable | Value |
| --- | --- |
| `VITE_NETWORK` | `mainnet` |
| `VITE_VAULT_ID` | the contract id from step 3 |
| `VITE_RELAYER_URL` | your relayer's public URL, or leave unset |

Enable Pages under Settings → Pages with source "GitHub Actions".

To host elsewhere, `npm run build --workspace web` produces a static `web/dist`
that any static host will serve.

## 7. Run the relayer (optional)

Only needed if you want signers to act without holding XLM.

```bash
cp relayer/.env.example relayer/.env      # then edit it
npm run build --workspace relayer
npm run relayer
```

Operating notes:

- **Use a dedicated sponsor account.** Never the vault, never a signer.
- **Fund it with what you can afford to lose.** The per-process budget is not a
  hard ceiling across replicas; the account balance is.
- **Run one instance** unless you have moved the spend guard to shared state.
- **Terminate TLS in front of it** and keep `SIGIL_SPONSOR_SECRET` out of logs,
  images and shell history.
- **Watch `/health`.** It reports the sponsor balance and remaining budget; a
  drained sponsor is the failure users notice first.

## Keeping the vault alive

Every entry point extends the contract's instance TTL, so a vault in regular use
never archives. A vault left untouched for months may need its instance entry
restored with `stellar contract restore` before the next call. Funds are not at
risk either way.

## Rollback

There is no upgrade path and no migration. To move to new contract code:

1. Deploy the new contract.
2. Propose and execute transfers moving every token balance to it.
3. Repoint `VITE_VAULT_ID` and the relayer's `SIGIL_VAULT_ID`.

Because the old vault keeps working, this can be done one asset at a time.
