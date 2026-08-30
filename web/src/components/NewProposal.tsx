import { useState } from "react";
import { StrKey, type Action, type Config } from "sigil-vault-client";

import { config } from "../lib/config";
import { parseAmount } from "../lib/format";
import { useToken } from "../lib/hooks";
import { formatDuration } from "./ActionSummary";

type Kind = Action["tag"];

const KIND_LABELS: Record<Kind, string> = {
  Transfer: "Send tokens",
  AddSigner: "Add a signer",
  RemoveSigner: "Remove a signer",
  SetThreshold: "Change how many approvals are needed",
  SetDailyLimit: "Set a daily spending limit",
  SetTimelock: "Change the timelock",
};

interface NewProposalProps {
  readonly vaultConfig: Config;
  readonly busy: boolean;
  readonly onSubmit: (action: Action) => void;
  readonly onCancel: () => void;
}

export function NewProposal({ vaultConfig, busy, onSubmit, onCancel }: NewProposalProps) {
  const [kind, setKind] = useState<Kind>("Transfer");
  const [token, setToken] = useState<string>(config.nativeToken);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [signer, setSigner] = useState("");
  const [threshold, setThreshold] = useState(String(vaultConfig.threshold));
  const [timelock, setTimelock] = useState(String(vaultConfig.timelock));
  const [error, setError] = useState<string>();

  const tokenInfo = useToken(kind === "Transfer" || kind === "SetDailyLimit" ? token : undefined);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      onSubmit(buildAction());
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function buildAction(): Action {
    switch (kind) {
      case "Transfer": {
        requireContract(token, "token");
        requireAccount(recipient);
        if (!tokenInfo) throw new Error("Still reading the token's decimals — try again shortly");
        return {
          tag: "Transfer",
          values: [{ token, to: recipient, amount: parseAmount(amount, tokenInfo.decimals) }],
        };
      }
      case "AddSigner":
        requireAccount(signer);
        if (vaultConfig.signers.includes(signer)) throw new Error("That address is already a signer");
        return { tag: "AddSigner", values: [signer] };
      case "RemoveSigner":
        if (!signer) throw new Error("Choose the signer to remove");
        if (vaultConfig.signers.length - 1 < vaultConfig.threshold) {
          throw new Error(
            `Lower the approval requirement below ${vaultConfig.signers.length} first`,
          );
        }
        return { tag: "RemoveSigner", values: [signer] };
      case "SetThreshold": {
        const value = Number(threshold);
        if (!Number.isInteger(value) || value < 1 || value > vaultConfig.signers.length) {
          throw new Error(`Pick a number between 1 and ${vaultConfig.signers.length}`);
        }
        return { tag: "SetThreshold", values: [value] };
      }
      case "SetDailyLimit": {
        requireContract(token, "token");
        if (!tokenInfo) throw new Error("Still reading the token's decimals — try again shortly");
        const limit = amount.trim() === "0" ? 0n : parseAmount(amount, tokenInfo.decimals);
        return { tag: "SetDailyLimit", values: [{ token, daily_limit: limit }] };
      }
      case "SetTimelock": {
        const value = Number(timelock);
        if (!Number.isInteger(value) || value < 0) throw new Error("Enter a whole number of seconds");
        return { tag: "SetTimelock", values: [BigInt(value)] };
      }
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <label className="field">
        <span>What should this proposal do</span>
        <select value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {(kind === "Transfer" || kind === "SetDailyLimit") && (
        <>
          <label className="field">
            <span>Token</span>
            <input
              value={token}
              onChange={(event) => setToken(event.target.value.trim())}
              placeholder="C…"
              spellCheck={false}
            />
            <p className="hint">
              {tokenInfo
                ? `${tokenInfo.symbol}, ${tokenInfo.decimals} decimal places`
                : "Reading the token…"}
            </p>
          </label>
          {kind === "Transfer" && (
            <label className="field">
              <span>Recipient</span>
              <input
                value={recipient}
                onChange={(event) => setRecipient(event.target.value.trim())}
                placeholder="G… or C…"
                spellCheck={false}
              />
            </label>
          )}
          <label className="field">
            <span>{kind === "Transfer" ? "Amount" : "Daily limit (0 removes it)"}</span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
            />
          </label>
        </>
      )}

      {kind === "AddSigner" && (
        <label className="field">
          <span>New signer</span>
          <input
            value={signer}
            onChange={(event) => setSigner(event.target.value.trim())}
            placeholder="G…"
            spellCheck={false}
          />
        </label>
      )}

      {kind === "RemoveSigner" && (
        <label className="field">
          <span>Signer to remove</span>
          <select value={signer} onChange={(event) => setSigner(event.target.value)}>
            <option value="">Choose a signer</option>
            {vaultConfig.signers.map((address) => (
              <option key={address} value={address}>
                {address}
              </option>
            ))}
          </select>
        </label>
      )}

      {kind === "SetThreshold" && (
        <label className="field">
          <span>Approvals needed</span>
          <input
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            inputMode="numeric"
          />
          <p className="hint">Between 1 and {vaultConfig.signers.length}.</p>
        </label>
      )}

      {kind === "SetTimelock" && (
        <label className="field">
          <span>Timelock, in seconds</span>
          <input
            value={timelock}
            onChange={(event) => setTimelock(event.target.value)}
            inputMode="numeric"
          />
          <p className="hint">
            Currently {formatDuration(Number(vaultConfig.timelock))}. The wait starts once enough
            signers approve.
          </p>
        </label>
      )}

      {error && (
        <p className="notice" data-tone="error">
          {error}
        </p>
      )}

      <div className="proposal-actions">
        <button className="button" data-kind="primary" type="submit" disabled={busy}>
          {busy ? "Proposing…" : "Create proposal"}
        </button>
        <button className="button" data-kind="quiet" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function requireAccount(address: string): void {
  if (!StrKey.isValidEd25519PublicKey(address) && !StrKey.isValidContract(address)) {
    throw new Error("Enter a valid Stellar address (G… or C…)");
  }
}

function requireContract(address: string, label: string): void {
  if (!StrKey.isValidContract(address)) {
    throw new Error(`Enter a valid ${label} contract address (C…)`);
  }
}
