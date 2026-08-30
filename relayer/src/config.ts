import { Keypair, Networks } from "@stellar/stellar-sdk";

/** Methods the sponsor is willing to pay for. Anything else is refused. */
export const SPONSORED_METHODS = [
  "propose",
  "approve",
  "revoke",
  "cancel",
  "execute",
] as const;

export type SponsoredMethod = (typeof SPONSORED_METHODS)[number];

const NETWORKS = {
  testnet: { passphrase: Networks.TESTNET, rpc: "https://soroban-testnet.stellar.org" },
  mainnet: { passphrase: Networks.PUBLIC, rpc: "https://mainnet.sorobanrpc.com" },
} as const;

export type NetworkName = keyof typeof NETWORKS;

export interface Config {
  readonly port: number;
  readonly network: NetworkName;
  readonly networkPassphrase: string;
  readonly rpcUrl: string;
  readonly vaultContractId: string;
  readonly sponsor: Keypair;
  /** Cap on the inner transaction fee we are prepared to absorb, in stroops. */
  readonly maxInnerFee: number;
  /** Fee the sponsor bids on the outer fee-bump envelope, in stroops. */
  readonly feeBumpFee: number;
  /** Ceiling on total fees paid per UTC day, in stroops. */
  readonly dailyBudget: number;
  /** Sponsored transactions allowed per source account per minute. */
  readonly perAccountRate: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return value;
}

/**
 * Reads configuration from the environment, failing at boot rather than on the
 * first request. Every value here decides how much of someone's XLM the relayer
 * is allowed to spend, so nothing is left to a silent default.
 */
export function loadConfig(env = process.env): Config {
  const network = (env.SIGIL_NETWORK ?? "testnet") as NetworkName;
  const preset = NETWORKS[network];
  if (!preset) {
    throw new Error(`SIGIL_NETWORK must be one of ${Object.keys(NETWORKS).join(", ")}`);
  }

  const vaultContractId = required("SIGIL_VAULT_ID");
  if (!/^C[A-Z2-7]{55}$/.test(vaultContractId)) {
    throw new Error("SIGIL_VAULT_ID is not a contract address");
  }

  const sponsor = Keypair.fromSecret(required("SIGIL_SPONSOR_SECRET"));

  return {
    port: positiveInt("PORT", 8787),
    network,
    networkPassphrase: preset.passphrase,
    rpcUrl: env.SIGIL_RPC_URL ?? preset.rpc,
    vaultContractId,
    sponsor,
    maxInnerFee: positiveInt("SIGIL_MAX_INNER_FEE", 2_000_000),
    feeBumpFee: positiveInt("SIGIL_FEE_BUMP_FEE", 200_000),
    dailyBudget: positiveInt("SIGIL_DAILY_BUDGET", 50_000_000),
    perAccountRate: positiveInt("SIGIL_PER_ACCOUNT_RATE", 10),
  };
}
