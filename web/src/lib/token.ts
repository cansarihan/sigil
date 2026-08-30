import {
  Account,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  rpc,
  scValToNative,
} from "sigil-vault-client";

import { config } from "./config";

export interface TokenInfo {
  readonly contractId: string;
  readonly symbol: string;
  readonly decimals: number;
}

/** Simulation needs a source account but never a real one. */
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const cache = new Map<string, Promise<TokenInfo>>();

/**
 * Reads a token's symbol and decimals from the chain. Any SEP-41 token works,
 * so a vault is not limited to assets this UI was built knowing about.
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

/**
 * Calls a nullary view by simulation rather than through a generated client.
 * Building a client would mean fetching and parsing the contract's spec, which
 * fails outright on Stellar Asset Contracts — including native XLM, the token
 * most vaults actually hold. The return types here are fixed by SEP-41, so the
 * spec buys nothing.
 */
async function view(contractId: string, method: string): Promise<unknown> {
  const server = new rpc.Server(config.rpcUrl);
  const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, "0"), {
    fee: BASE_FEE,
    networkPassphrase: config.passphrase,
  })
    .addOperation(new Contract(contractId).call(method))
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(`${contractId} has no ${method}(): ${simulation.error}`);
  }
  if (!simulation.result) {
    throw new Error(`${contractId}.${method}() returned nothing`);
  }
  return scValToNative(simulation.result.retval);
}

async function load(contractId: string): Promise<TokenInfo> {
  const [symbol, decimals] = await Promise.all([
    view(contractId, "symbol") as Promise<string>,
    view(contractId, "decimals") as Promise<number>,
  ]);

  return {
    contractId,
    // The native asset reports itself as "native"; nobody calls it that.
    symbol: symbol === "native" ? "XLM" : symbol,
    decimals,
  };
}
