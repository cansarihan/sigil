import {
  Address,
  FeeBumpTransaction,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import { SPONSORED_METHODS, type Config, type SponsoredMethod } from "./config.js";

export interface SponsorableTx {
  readonly tx: Transaction;
  readonly method: SponsoredMethod;
  readonly source: string;
  readonly fee: number;
}

export type Verdict =
  | { readonly ok: true; readonly value: SponsorableTx }
  | { readonly ok: false; readonly reason: string };

const reject = (reason: string): Verdict => ({ ok: false, reason });

/**
 * Decides whether the sponsor should pay for a client-signed transaction.
 *
 * The sponsor's signature on a fee bump is an unconditional promise to pay, so
 * every property that bounds the cost is checked here — before any network
 * call — and anything unrecognised is refused rather than interpreted.
 */
export function inspect(envelopeXdr: string, config: Config): Verdict {
  let parsed: Transaction | FeeBumpTransaction;
  try {
    parsed = TransactionBuilder.fromXDR(envelopeXdr, config.networkPassphrase);
  } catch {
    return reject("not a transaction envelope for this network");
  }

  // Nesting fee bumps would let a caller hide the real payload one layer down.
  if (parsed instanceof FeeBumpTransaction) {
    return reject("already a fee-bump transaction");
  }
  const tx = parsed;

  // Without a client signature there is nothing to sponsor, and submitting it
  // would burn the sponsor's fee on a transaction that cannot succeed.
  if (tx.signatures.length === 0) {
    return reject("inner transaction is unsigned");
  }

  const fee = Number(tx.fee);
  if (!Number.isFinite(fee) || fee > config.maxInnerFee) {
    return reject(`inner fee ${tx.fee} exceeds the ${config.maxInnerFee} stroop ceiling`);
  }

  // One operation keeps the cost knowable: a batch could bundle a sponsored
  // vault call with an unrelated payment out of the source account.
  if (tx.operations.length !== 1) {
    return reject(`expected exactly 1 operation, got ${tx.operations.length}`);
  }

  const operation = tx.operations[0];
  if (!operation || operation.type !== "invokeHostFunction") {
    return reject(`unsupported operation type: ${operation?.type ?? "none"}`);
  }

  const invocation = readContractCall(operation.func);
  if (!invocation) {
    return reject("host function is not a contract invocation");
  }
  if (invocation.contractId !== config.vaultContractId) {
    return reject(`contract ${invocation.contractId} is not the sponsored vault`);
  }
  if (!isSponsored(invocation.method)) {
    return reject(`method ${invocation.method} is not sponsored`);
  }

  return { ok: true, value: { tx, method: invocation.method, source: tx.source, fee } };
}

function isSponsored(method: string): method is SponsoredMethod {
  return (SPONSORED_METHODS as readonly string[]).includes(method);
}

function readContractCall(
  func: xdr.HostFunction,
): { contractId: string; method: string } | undefined {
  if (func.switch().name !== "hostFunctionTypeInvokeContract") return undefined;

  const args = func.invokeContract();
  return {
    contractId: Address.fromScAddress(args.contractAddress()).toString(),
    method: args.functionName().toString(),
  };
}
