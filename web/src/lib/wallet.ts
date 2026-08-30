import {
  getAddress,
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";

import { config } from "./config";

export class WalletError extends Error {}

/** True when the Freighter extension is present in this browser. */
export async function walletAvailable(): Promise<boolean> {
  const { isConnected: present } = await isConnected();
  return present;
}

/** Returns the already-authorised address, or undefined if there is none. */
export async function currentAddress(): Promise<string | undefined> {
  const { address, error } = await getAddress();
  if (error || !address) return undefined;
  return address;
}

/** Prompts for access. Throws with the wallet's own wording on refusal. */
export async function connect(): Promise<string> {
  const { address, error } = await requestAccess();
  if (error) throw new WalletError(String(error));
  if (!address) throw new WalletError("Freighter returned no address");
  return address;
}

/**
 * Signs a transaction envelope. Passing the address explicitly means a user
 * who switched accounts mid-session gets a clear wallet-side mismatch rather
 * than a silently wrong signature.
 */
export async function sign(
  xdr: string,
  address: string,
): Promise<{ signedTxXdr: string; signerAddress: string }> {
  const result = await signTransaction(xdr, {
    networkPassphrase: config.passphrase,
    address,
  });
  if (result.error) throw new WalletError(String(result.error));
  return result;
}
