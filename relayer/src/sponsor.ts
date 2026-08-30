import { TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client as VaultClient } from "sigil-vault-client";

import type { Config } from "./config.js";
import type { SponsorableTx } from "./policy.js";

export interface Settlement {
  readonly hash: string;
  readonly status: string;
}

/**
 * A fee bump replaces the inner fee entirely, and stellar-base requires the
 * outer bid to be at least the inner one. The configured fee is therefore a
 * floor, not a fixed price.
 */
export function bidFor(config: Config, innerFee: number): number {
  return Math.max(config.feeBumpFee, innerFee);
}

/** What the sponsor actually risks: one bid for the inner op, one for the bump. */
export function costOf(config: Config, innerFee: number): number {
  return bidFor(config, innerFee) * 2;
}

export class Sponsor {
  private readonly server: rpc.Server;
  private readonly vault: VaultClient;

  constructor(private readonly config: Config) {
    this.server = new rpc.Server(config.rpcUrl);
    this.vault = new VaultClient({
      contractId: config.vaultContractId,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      publicKey: config.sponsor.publicKey(),
      ...basicNodeSigner(config.sponsor, config.networkPassphrase),
    });
  }

  get address(): string {
    return this.config.sponsor.publicKey();
  }

  /**
   * Current XLM balance of the sponsor account, in stroops. Surfaced on
   * /health so an operator notices a drained sponsor before users do.
   */
  async balance(): Promise<string> {
    const key = xdr.LedgerKey.account(
      new xdr.LedgerKeyAccount({ accountId: this.config.sponsor.xdrAccountId() }),
    );
    const { entries } = await this.server.getLedgerEntries(key);
    const entry = entries[0];
    return entry ? entry.val.account().balance().toString() : "0";
  }

  /** True when `address` is in the vault's current signer set. */
  async isSigner(address: string): Promise<boolean> {
    const tx = await this.vault.is_signer({ address });
    return tx.result;
  }

  /**
   * Wraps a client-signed transaction in a fee bump the sponsor pays for, and
   * submits it. The inner signature is untouched, so the user's authorization
   * is exactly what they signed.
   */
  async sponsor(sponsorable: SponsorableTx): Promise<Settlement> {
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      this.config.sponsor,
      String(bidFor(this.config, sponsorable.fee)),
      sponsorable.tx,
      this.config.networkPassphrase,
    );
    feeBump.sign(this.config.sponsor);

    const sent = await this.server.sendTransaction(feeBump);
    if (sent.status === "ERROR") {
      throw new SubmissionError(`rpc rejected the transaction: ${sent.status}`, sent.hash);
    }
    return this.settle(sent.hash);
  }

  /**
   * Settles a proposal with no client involvement at all. `execute` carries no
   * authorization requirement, so the relayer builds, signs and pays for the
   * whole transaction — the fully gasless path.
   */
  async execute(id: number): Promise<Settlement> {
    const tx = await this.vault.execute({ id });
    const sent = await tx.signAndSend();
    return { hash: sent.sendTransactionResponse?.hash ?? "", status: "SUCCESS" };
  }

  /** Polls until the network reports a final outcome for `hash`. */
  private async settle(hash: string, timeoutMs = 30_000): Promise<Settlement> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await this.server.getTransaction(hash);
      if (result.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) {
        if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
          throw new SubmissionError("transaction failed on chain", hash);
        }
        return { hash, status: result.status };
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new SubmissionError("timed out waiting for the transaction to close", hash);
  }
}

export class SubmissionError extends Error {
  constructor(
    message: string,
    readonly hash: string,
  ) {
    super(message);
    this.name = "SubmissionError";
  }
}
