# User onboarding

Level 6 asks for a feedback form, an exported spreadsheet of responses, and a
plan built from what those responses say. This directory holds the form
specification and the spreadsheet template; the export itself is added here
once responses start arriving.

## The form

Create it at <https://forms.google.com>, titled **Sigil — early access
feedback**, with this description:

> Sigil is a shared treasury on Stellar that only moves money when enough of
> your team agrees. Tell us who you are and what you thought — it takes two
> minutes and it decides what we build next.

| # | Question | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| 1 | Your name | Short answer | Yes | |
| 2 | Email | Short answer | Yes | Enable response validation → Text → Email |
| 3 | Stellar wallet address | Short answer | Yes | Regex validation: `^G[A-Z2-7]{55}$` |
| 4 | Which network did you use? | Multiple choice | Yes | Mainnet / Testnet |
| 5 | Vault contract you interacted with | Short answer | No | Regex: `^C[A-Z2-7]{55}$` |
| 6 | How would you rate Sigil overall? | Linear scale 1–5 | Yes | 1 = "Would not use", 5 = "Would use daily" |
| 7 | How clear was the approval flow? | Linear scale 1–5 | Yes | 1 = "Confusing", 5 = "Obvious" |
| 8 | Did you use the fee relayer? | Multiple choice | Yes | Yes / No / Did not notice it |
| 9 | What was the single most confusing part? | Paragraph | No | This is the question that changes the roadmap |
| 10 | What would make you trust this with real money? | Paragraph | No | |
| 11 | Anything else? | Paragraph | No | |

Turn on **Collect email addresses** and **Limit to 1 response** so the wallet
addresses stay one-per-person and can be cross-checked against on-chain
activity.

Add the form's public link to the root `README.md` under *User onboarding*.

## Exporting to a spreadsheet

1. Open the form → **Responses** → the green Sheets icon → **Create new
   spreadsheet**.
2. In the sheet: **File → Download → Microsoft Excel (.xlsx)**.
3. Save it here as `responses.xlsx` and commit it.
4. Link it from the root `README.md`.

`responses-template.csv` in this directory has the exact column headers Google
Sheets produces for the questions above, so the analysis below works on the
real export without editing.

## Verifying that a respondent is real

A form response is a claim. Confirm it against the chain before counting it:

```bash
# Did this address actually touch the vault?
stellar events --network mainnet --start-ledger <LEDGER> \
  --id <VAULT_CONTRACT_ID> --output json | grep <WALLET_ADDRESS>
```

Or open `https://stellar.expert/explorer/public/account/<WALLET_ADDRESS>` and
look for an invocation of the vault contract. Count a user as verified only
when both the form response and an on-chain interaction exist.

Record the tally in the root `README.md`:

| Metric | Where it comes from |
| --- | --- |
| Form responses | Row count in `responses.xlsx` |
| Verified users | Responses whose wallet appears in vault events |
| Transactions | Vault invocations on the explorer |

## Turning feedback into work

For each theme that appears more than once, open a GitHub issue, do the work,
and record the commit that closed it in the *What we are building next* table in
the root `README.md`. A feedback section with no commit links behind it is a
promise, not a changelog.
