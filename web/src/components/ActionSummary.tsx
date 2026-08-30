import type { Action } from "sigil-vault-client";

import { formatAmount, shortAddress } from "../lib/format";
import { useToken } from "../lib/hooks";

/**
 * One line saying what a proposal does. Amounts wait for the token's decimals
 * rather than guessing seven, because a wrong decimal place here reads as a
 * hundred-fold error in a payment someone is about to approve.
 */
export function ActionSummary({ action }: { readonly action: Action }) {
  const token = useToken(
    action.tag === "Transfer"
      ? action.values[0].token
      : action.tag === "SetDailyLimit"
        ? action.values[0].token
        : undefined,
  );

  switch (action.tag) {
    case "Transfer": {
      const { amount, to } = action.values[0];
      return (
        <>
          Send{" "}
          <strong className="mono">
            {token ? `${formatAmount(amount, token.decimals)} ${token.symbol}` : "…"}
          </strong>{" "}
          to <span className="mono">{shortAddress(to)}</span>
        </>
      );
    }
    case "AddSigner":
      return (
        <>
          Add signer <span className="mono">{shortAddress(action.values[0])}</span>
        </>
      );
    case "RemoveSigner":
      return (
        <>
          Remove signer <span className="mono">{shortAddress(action.values[0])}</span>
        </>
      );
    case "SetThreshold":
      return <>Require {action.values[0]} approvals</>;
    case "SetTimelock":
      return <>Set the timelock to {formatDuration(Number(action.values[0]))}</>;
    case "SetDailyLimit": {
      const { daily_limit: limit } = action.values[0];
      if (limit === 0n) {
        return <>Remove the daily spending limit on {token?.symbol ?? "this token"}</>;
      }
      return (
        <>
          Cap daily spending at{" "}
          <strong className="mono">
            {token ? `${formatAmount(limit, token.decimals)} ${token.symbol}` : "…"}
          </strong>
        </>
      );
    }
  }
}

export function formatDuration(seconds: number): string {
  if (seconds === 0) return "none";
  if (seconds % 86_400 === 0) return `${seconds / 86_400}d`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}
