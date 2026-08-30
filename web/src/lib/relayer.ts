import { config } from "./config";

export interface RelayerStatus {
  network: string;
  vault: string;
  sponsor: string;
  sponsorBalanceStroops: string;
  remainingBudgetStroops: number;
}

export interface Settlement {
  hash: string;
  status: string;
}

export const relayerConfigured = config.relayerUrl.length > 0;

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${config.relayerUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? `Relayer refused the request (${response.status})`);
  }
  return payload as T;
}

/** Confirms the relayer is up and sponsoring the vault this UI is pointed at. */
export async function status(): Promise<RelayerStatus | undefined> {
  if (!relayerConfigured) return undefined;
  try {
    const response = await fetch(`${config.relayerUrl}/health`);
    if (!response.ok) return undefined;
    const health = (await response.json()) as RelayerStatus;
    return health.vault === config.vaultId ? health : undefined;
  } catch {
    return undefined;
  }
}

/** Hands a signed envelope to the relayer, which pays the fee and submits it. */
export const sponsor = (xdr: string) => post<Settlement>("/sponsor", { xdr });

/** Asks the relayer to build, pay for and submit the execute call itself. */
export const execute = (id: number) => post<Settlement>("/execute", { id });
