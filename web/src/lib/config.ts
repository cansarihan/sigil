import { Networks } from "sigil-vault-client";

const NETWORKS = {
  testnet: {
    passphrase: Networks.TESTNET,
    rpcUrl: "https://soroban-testnet.stellar.org",
    explorer: "https://stellar.expert/explorer/testnet",
    /** The Stellar Asset Contract for native XLM, prefilled in payout forms. */
    nativeToken: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  },
  mainnet: {
    passphrase: Networks.PUBLIC,
    rpcUrl: "https://mainnet.sorobanrpc.com",
    explorer: "https://stellar.expert/explorer/public",
    nativeToken: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
  },
} as const;

export type NetworkName = keyof typeof NETWORKS;

function readNetwork(): NetworkName {
  const name = import.meta.env.VITE_NETWORK ?? "testnet";
  if (name in NETWORKS) return name as NetworkName;
  throw new Error(`VITE_NETWORK must be testnet or mainnet, got "${name}"`);
}

const network = readNetwork();

export const config = {
  network,
  ...NETWORKS[network],
  vaultId: import.meta.env.VITE_VAULT_ID ?? "",
  /** Blank means signers pay their own fees and the relayer switch is hidden. */
  relayerUrl: (import.meta.env.VITE_RELAYER_URL ?? "").replace(/\/$/, ""),
} as const;

export const explorerTx = (hash: string) => `${config.explorer}/tx/${hash}`;
export const explorerAccount = (address: string) =>
  `${config.explorer}/${address.startsWith("C") ? "contract" : "account"}/${address}`;
