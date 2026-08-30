import { contract } from "sigil-vault-client";

import { config } from "./config";

export interface TokenInfo {
  readonly contractId: string;
  readonly symbol: string;
  readonly decimals: number;
}

const cache = new Map<string, Promise<TokenInfo>>();

/**
 * Reads a token's symbol and decimals from the chain. Any SEP-41 token works,
 * so a vault is not limited to the assets this UI happens to know about.
 */
export function tokenInfo(contractId: string): Promise<TokenInfo> {
  const cached = cache.get(contractId);
  if (cached) return cached;

  const pending = load(contractId).catch((error) => {
    // Don't cache a failure: a transient RPC error should not permanently
    // leave the token unnamed for the rest of the session.
    cache.delete(contractId);
    throw error;
  });
  cache.set(contractId, pending);
  return pending;
}

/** The slice of the SEP-41 interface this app needs. */
interface TokenMetadata {
  symbol(): Promise<contract.AssembledTransaction<string>>;
  decimals(): Promise<contract.AssembledTransaction<number>>;
}

async function load(contractId: string): Promise<TokenInfo> {
  // Client.from reads the spec off the chain, so the methods are only known
  // at runtime; this names the two we rely on.
  const client = (await contract.Client.from({
    contractId,
    networkPassphrase: config.passphrase,
    rpcUrl: config.rpcUrl,
  })) as unknown as TokenMetadata;

  const [symbol, decimals] = await Promise.all([client.symbol(), client.decimals()]);
  return { contractId, symbol: symbol.result, decimals: decimals.result };
}
