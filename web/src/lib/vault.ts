import {
  Client,
  type Action,
  type Config as VaultConfig,
  type Proposal,
  type contract,
} from "sigil-vault-client";

import { config } from "./config";
import * as relayer from "./relayer";
import { sign } from "./wallet";

/** Who pays the network fee for an action. */
export type FeeMode = "self" | "relayer";

export interface Settlement {
  readonly hash: string;
}

/**
 * Without a public key the SDK simulates against a null account, which is all
 * a read needs — so the dashboard renders for visitors with no wallet.
 */
export function vaultClient(publicKey?: string): Client {
  return new Client({
    contractId: config.vaultId,
    networkPassphrase: config.passphrase,
    rpcUrl: config.rpcUrl,
    ...(publicKey ? { publicKey } : {}),
  });
}

export interface VaultState {
  readonly config: VaultConfig;
  readonly proposals: readonly Proposal[];
}

/** Loads the config and the full proposal history in one pass. */
export async function readVault(): Promise<VaultState> {
  const client = vaultClient();
  const [vaultConfig, count] = await Promise.all([
    client.config(),
    client.proposal_count(),
  ]);

  const total = count.result;
  const pages: Proposal[] = [];
  const pageSize = 50;
  for (let start = 0; start < total; start += pageSize) {
    const page = await client.proposals({ start, limit: pageSize });
    pages.push(...page.result);
  }

  return { config: vaultConfig.result, proposals: pages };
}

export async function readBalance(token: string): Promise<bigint> {
  const { result } = await vaultClient().balance({ token });
  return result;
}

export async function readDailyLimit(token: string): Promise<{ limit: bigint; spent: bigint }> {
  const client = vaultClient();
  const [limit, spent] = await Promise.all([
    client.daily_limit({ token }),
    client.spent_today({ token }),
  ]);
  return { limit: limit.result, spent: spent.result };
}

// ----- writes -----

const signWith = (address: string) => (xdr: string) => sign(xdr, address);

/**
 * Signs and settles a prepared call. In relayer mode the user still signs the
 * inner transaction — the relayer only adds an envelope that pays for it, so
 * authorization never leaves the user's wallet.
 */
async function settle(
  prepared: contract.AssembledTransaction<unknown>,
  address: string,
  mode: FeeMode,
): Promise<Settlement> {
  if (mode === "relayer") {
    await prepared.sign({ signTransaction: signWith(address) });
    const signed = prepared.signed;
    if (!signed) throw new Error("The wallet did not return a signed transaction");
    return relayer.sponsor(signed.toXDR());
  }

  const sent = await prepared.signAndSend({ signTransaction: signWith(address) });
  return { hash: sent.sendTransactionResponse?.hash ?? "" };
}

export async function propose(
  address: string,
  action: Action,
  mode: FeeMode,
): Promise<Settlement> {
  const client = vaultClient(address);
  return settle(await client.propose({ proposer: address, action }), address, mode);
}

export async function approve(address: string, id: number, mode: FeeMode): Promise<Settlement> {
  const client = vaultClient(address);
  return settle(await client.approve({ signer: address, id }), address, mode);
}

export async function revoke(address: string, id: number, mode: FeeMode): Promise<Settlement> {
  const client = vaultClient(address);
  return settle(await client.revoke({ signer: address, id }), address, mode);
}

export async function cancel(address: string, id: number, mode: FeeMode): Promise<Settlement> {
  const client = vaultClient(address);
  return settle(await client.cancel({ signer: address, id }), address, mode);
}

/**
 * Executing needs no authorization on chain, so in relayer mode the user does
 * not sign at all — the relayer carries the whole transaction.
 */
export async function execute(address: string, id: number, mode: FeeMode): Promise<Settlement> {
  if (mode === "relayer") return relayer.execute(id);
  const client = vaultClient(address);
  return settle(await client.execute({ id }), address, mode);
}
