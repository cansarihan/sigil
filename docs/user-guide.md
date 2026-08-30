# User guide

Sigil is a shared wallet that needs more than one person to agree before money
leaves it. This guide covers both ways to use it: the dashboard, and the
command line.

## What you need

- **Freighter**, the Stellar browser wallet — <https://freighter.app>
- **To be a signer.** Your address must be in the vault's signer set. If it is
  not, you can watch the vault but not act on it.
- **XLM for fees**, unless your team runs the relayer. Fees are fractions of a
  cent, but the account still needs a balance.

## The words

| Term | What it means |
| --- | --- |
| **Signer** | Someone who can propose and approve. |
| **Threshold** | How many signers must approve before anything happens. |
| **Proposal** | A requested action, waiting for approvals. |
| **Timelock** | A wait between the last approval and the payment. |
| **Execute** | The final step that actually moves the money. |

## Using the dashboard

### Connect

Open the app and choose **Connect Freighter**. Approve the connection in the
extension. Your address appears in the header; if you are a signer, the
**New proposal** button appears with it.

### Read the page

The top of the page is what the vault holds and who controls it — the ring of
signers, with yours marked. Below that, proposals are grouped by what they need:

1. **Waiting for your approval** — the reason you opened the page.
2. **Ready to execute** — enough approvals, timelock elapsed. Anyone can finish these.
3. **Collecting approvals** — waiting on other people, or on the clock.
4. **Closed** — executed, cancelled or expired.

Each proposal carries a seal ring: one arc per signer, filled as approvals
arrive. Amber while collecting, red once quorum is reached, green once settled.

### Propose a payment

**New proposal** → **Send tokens** → fill in the token, recipient and amount.
The form reads the token's decimals from the chain and tells you what it found,
so check the symbol matches what you meant to send.

Your own approval is recorded when you propose. A 2-of-3 vault needs one more.

### Approve

Open a proposal in your lane and choose **Approve**. Freighter will ask you to
sign. Read the recipient and amount in the wallet, not just on the page.

Changed your mind? **Withdraw approval** removes it. If that drops the proposal
below the threshold, the timelock resets — so an objection genuinely buys the
group time.

### Execute

Once a proposal is in **Ready to execute**, anyone can finish it — signer or
not. This is deliberate: it means a payment never waits on one particular
person being online.

### Governance

Adding a signer, removing one, changing the threshold, setting a spending limit
and changing the timelock are all proposals in the same form. They need the same
approvals as a payment. There is no admin who can skip the queue.

Removing a signer immediately voids any approvals they had left on open
proposals — that is the point of removing them.

### Fees, and the relayer

If your team runs a relayer, a **Relayer pays fees** switch appears in the
header. With it on you can approve and execute without holding XLM: you still
sign in Freighter, the relayer just pays the network fee.

Executing costs you nothing either way when the relayer is on — that step needs
no signature at all.

The switch only appears when the relayer is reachable and confirms it sponsors
this vault.

## Using the command line

Install `stellar-cli`, then:

```bash
VAULT=<CONTRACT_ID>
NET=mainnet          # or testnet
```

**See the configuration**

```bash
stellar contract invoke --id $VAULT --source you --network $NET -- config
```

**Propose a payment** (amounts are base units — 10 XLM is `100000000`)

```bash
stellar contract invoke --id $VAULT --source you --network $NET -- \
  propose --proposer <YOUR_ADDRESS> \
  --action '{"Transfer":{"token":"<TOKEN_ID>","to":"<RECIPIENT>","amount":"100000000"}}'
```

**Approve, then execute**

```bash
stellar contract invoke --id $VAULT --source you --network $NET -- approve --signer <YOUR_ADDRESS> --id 0
stellar contract invoke --id $VAULT --source anyone --network $NET -- execute --id 0
```

**List proposals**

```bash
stellar contract invoke --id $VAULT --source you --network $NET -- proposals --start 0 --limit 20
```

## When something is refused

The contract names its refusals. The dashboard shows the name; the CLI shows
`Error(Contract, #n)`.

| Error | Why | What to do |
| --- | --- | --- |
| `NotSigner` (1) | You are not in the signer set | Ask the group to add you |
| `AlreadyApproved` (6) | You already approved this | Nothing to do |
| `NotPending` (8) | Already executed, cancelled, or being re-executed | Refresh the page |
| `ThresholdNotMet` (9) | Not enough approvals from current signers | Collect more approvals |
| `TimelockActive` (10) | Approved, but the wait has not elapsed | Check the "executable in" time |
| `Expired` (11) | Nobody executed it in time | Propose it again |
| `NotProposer` (12) | Only the proposer can cancel | Ask them, or let it expire |
| `DailyLimitExceeded` (14) | This payment would cross today's cap | Wait for tomorrow, or raise the cap |
| `ThresholdUnreachable` (17) | Removing this signer would strand the threshold | Lower the threshold first |

## Habits worth keeping

- **Read the amount in Freighter**, not only in the browser. The wallet is the
  thing that cannot be spoofed by a compromised page.
- **Keep signer keys apart.** Three keys in one password manager is a 1-of-3
  vault wearing a 2-of-3 costume.
- **Set a daily limit.** It turns a worst case into a bounded one.
- **Withdraw approval when in doubt.** It is free, and it resets the clock.
