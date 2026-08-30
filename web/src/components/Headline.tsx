import type { Config } from "sigil-vault-client";

import { config } from "../lib/config";
import { formatAmount, shortAddress } from "../lib/format";
import { useToken } from "../lib/hooks";
import { formatDuration } from "./ActionSummary";

interface HeadlineProps {
  readonly vaultConfig: Config;
  readonly balance: bigint | undefined;
  readonly limit: { limit: bigint; spent: bigint } | undefined;
  readonly viewer: string | undefined;
}

/**
 * What the vault holds and who can move it. The signer roll is listed rather
 * than counted, because "who else has to agree" is the question that decides
 * whether a proposal is worth opening.
 */
export function Headline({ vaultConfig, balance, limit, viewer }: HeadlineProps) {
  const token = useToken(config.nativeToken);
  const capped = limit !== undefined && limit.limit > 0n;

  return (
    <>
      <section className="headline">
        <div>
          <p className="eyebrow">Held in the vault</p>
          <p className="held">
            {balance !== undefined && token ? formatAmount(balance, token.decimals) : "—"}
            <small>{token?.symbol ?? "XLM"}</small>
          </p>
        </div>

        <div className="quorum-note">
          <strong>
            {vaultConfig.threshold} of {vaultConfig.signers.length}
          </strong>
          approvals move money
          {vaultConfig.timelock > 0n && (
            <>
              , then a {formatDuration(Number(vaultConfig.timelock))} wait
            </>
          )}
          {capped && token && (
            <>
              <span className="meter" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.min(100, Number((limit.spent * 100n) / limit.limit))}%`,
                  }}
                />
              </span>
              <span className="mono dim">
                {formatAmount(limit.spent, token.decimals)} /{" "}
                {formatAmount(limit.limit, token.decimals)} today
              </span>
            </>
          )}
        </div>
      </section>

      <ul className="roll">
        {vaultConfig.signers.map((address) => (
          <li key={address} data-you={address === viewer}>
            <span className="roll-mark" aria-hidden="true">
              ◆
            </span>
            <span className="mono">{shortAddress(address)}</span>
            {address === viewer && <span className="dim">you</span>}
          </li>
        ))}
      </ul>
    </>
  );
}
