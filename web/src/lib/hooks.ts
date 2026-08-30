import { useEffect, useState } from "react";

import { tokenInfo, type TokenInfo } from "./token";

/** Ledger time in seconds, refreshed so "ready in 4m" counts down on its own. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Token symbol and decimals, or undefined while the lookup is in flight. */
export function useToken(contractId: string | undefined): TokenInfo | undefined {
  const [info, setInfo] = useState<TokenInfo>();

  useEffect(() => {
    if (!contractId) return;
    let live = true;
    tokenInfo(contractId)
      .then((resolved) => live && setInfo(resolved))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [contractId]);

  return info;
}
