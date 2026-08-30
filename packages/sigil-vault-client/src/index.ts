import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CBP4O4G5VI3UB6L5ED7R5JUNZ7QZZMWWJYLTL6GOVK6S7II4P66GTRZ5",
  }
} as const

export const Errors = {
  /**
   * Caller is not part of the current signer set.
   */
  1: {message:"NotSigner"},
  /**
   * threshold must satisfy 1 <= threshold <= signers.len()
   */
  2: {message:"InvalidThreshold"},
  /**
   * The same address appears twice in the signer set.
   */
  3: {message:"DuplicateSigner"},
  /**
   * Signer set is empty or larger than MAX_SIGNERS.
   */
  4: {message:"InvalidSignerSet"},
  /**
   * No proposal exists with this id.
   */
  5: {message:"ProposalNotFound"},
  /**
   * This signer has already approved the proposal.
   */
  6: {message:"AlreadyApproved"},
  /**
   * This signer has no approval to revoke.
   */
  7: {message:"NotApproved"},
  /**
   * Proposal is not in the Pending state.
   */
  8: {message:"NotPending"},
  /**
   * Valid approvals are below the current threshold.
   */
  9: {message:"ThresholdNotMet"},
  /**
   * Threshold is met but the timelock has not elapsed.
   */
  10: {message:"TimelockActive"},
  /**
   * Proposal passed its expiry without being executed.
   */
  11: {message:"Expired"},
  /**
   * Only the proposer may cancel their own proposal.
   */
  12: {message:"NotProposer"},
  /**
   * Transfer amounts must be strictly positive.
   */
  13: {message:"InvalidAmount"},
  /**
   * Executing this transfer would breach the token's daily limit.
   */
  14: {message:"DailyLimitExceeded"},
  /**
   * Address is already a signer.
   */
  15: {message:"SignerExists"},
  /**
   * Address is not a signer, so it cannot be removed.
   */
  16: {message:"SignerMissing"},
  /**
   * Removing this signer would leave fewer signers than the threshold.
   */
  17: {message:"ThresholdUnreachable"},
  /**
   * Spend limits and TTLs must be non-negative / non-zero as documented.
   */
  18: {message:"InvalidConfig"}
}

/**
 * Everything the vault can be asked to do. Governance changes go through the
 * exact same M-of-N path as payouts — there is no privileged admin address.
 */
export type Action = {tag: "Transfer", values: readonly [Transfer]} | {tag: "AddSigner", values: readonly [string]} | {tag: "RemoveSigner", values: readonly [string]} | {tag: "SetThreshold", values: readonly [u32]} | {tag: "SetDailyLimit", values: readonly [SpendLimit]} | {tag: "SetTimelock", values: readonly [u64]};


export interface Config {
  /**
 * Lifetime of a proposal from creation to expiry.
 */
proposal_ttl: u64;
  signers: Array<string>;
  threshold: u32;
  /**
 * Delay between reaching the threshold and becoming executable.
 */
timelock: u64;
}

export type Status = {tag: "Pending", values: void} | {tag: "Executed", values: void} | {tag: "Cancelled", values: void};

export type DataKey = {tag: "Config", values: void} | {tag: "NextId", values: void} | {tag: "Proposal", values: readonly [u32]} | {tag: "Limit", values: readonly [string]} | {tag: "Spent", values: readonly [string, u64]};


export interface Proposal {
  action: Action;
  /**
 * Raw approval log. May contain addresses that have since been removed
 * from the signer set, so it is never trusted as a count on its own.
 */
approvals: Array<string>;
  created_at: u64;
  expires_at: u64;
  id: u32;
  proposer: string;
  /**
 * Ledger time at which execution becomes legal. `0` = threshold not met.
 */
ready_at: u64;
  status: Status;
}


/**
 * A treasury payout. `token` is any SEP-41 / Stellar Asset Contract address.
 */
export interface Transfer {
  amount: i128;
  to: string;
  token: string;
}


/**
 * A per-token rolling daily cap. `daily_limit == 0` means "no cap".
 */
export interface SpendLimit {
  daily_limit: i128;
  token: string;
}









export interface Client {
  /**
   * Construct and simulate a cancel transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraws a proposal entirely. Only the proposer can do this, and only
   * while it is still pending.
   */
  cancel: ({signer, id}: {signer: string, id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  config: (options?: MethodOptions) => Promise<AssembledTransaction<Config>>

  /**
   * Construct and simulate a revoke transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraws an approval. Dropping back below the threshold clears the
   * timelock, so a signer's objection genuinely buys the group time.
   */
  revoke: ({signer, id}: {signer: string, id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a approve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds `signer`'s approval. Reaching the threshold starts the timelock.
   */
  approve: ({signer, id}: {signer: string, id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  balance: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pulls `amount` of `token` from `from` into the vault. Direct transfers
   * to the vault address work too; this exists so deposits emit an event.
   */
  deposit: ({from, token, amount}: {from: string, token: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a execute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Carries out an approved proposal. Deliberately permissionless: the
   * gate is the proposal's own state, not the caller's identity, so a
   * relayer can pay the fee on the signers' behalf.
   */
  execute: ({id}: {id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a propose transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens a proposal. The proposer's own approval is recorded immediately,
   * so a 1-of-N vault executes after a single round trip.
   */
  propose: ({proposer, action}: {proposer: string, action: Action}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a proposal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  proposal: ({id}: {id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Proposal>>>

  /**
   * Construct and simulate a is_signer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_signer: ({address}: {address: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a proposals transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Page through proposals from `start`, oldest first. Ids whose entries
   * have expired out of storage are skipped rather than aborting the page.
   */
  proposals: ({start, limit}: {start: u32, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Array<Proposal>>>

  /**
   * Construct and simulate a daily_limit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * `0` means the token has no daily cap.
   */
  daily_limit: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a spent_today transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Amount of `token` already sent out in the current day bucket.
   */
  spent_today: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a proposal_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  proposal_count: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a valid_approvals transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Approvals that still count, i.e. those from addresses that are signers
   * right now. This is the number `execute` compares to the threshold.
   */
  valid_approvals: ({id}: {id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {signers, threshold, timelock, proposal_ttl}: {signers: Array<string>, threshold: u32, timelock: u64, proposal_ttl: u64},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({signers, threshold, timelock, proposal_ttl}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAGFXaXRoZHJhd3MgYSBwcm9wb3NhbCBlbnRpcmVseS4gT25seSB0aGUgcHJvcG9zZXIgY2FuIGRvIHRoaXMsIGFuZCBvbmx5CndoaWxlIGl0IGlzIHN0aWxsIHBlbmRpbmcuAAAAAAAABmNhbmNlbAAAAAAAAgAAAAAAAAAGc2lnbmVyAAAAAAATAAAAAAAAAAJpZAAAAAAABAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAGY29uZmlnAAAAAAAAAAAAAQAAB9AAAAAGQ29uZmlnAAA=",
        "AAAAAAAAAIRXaXRoZHJhd3MgYW4gYXBwcm92YWwuIERyb3BwaW5nIGJhY2sgYmVsb3cgdGhlIHRocmVzaG9sZCBjbGVhcnMgdGhlCnRpbWVsb2NrLCBzbyBhIHNpZ25lcidzIG9iamVjdGlvbiBnZW51aW5lbHkgYnV5cyB0aGUgZ3JvdXAgdGltZS4AAAAGcmV2b2tlAAAAAAACAAAAAAAAAAZzaWduZXIAAAAAABMAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAEVBZGRzIGBzaWduZXJgJ3MgYXBwcm92YWwuIFJlYWNoaW5nIHRoZSB0aHJlc2hvbGQgc3RhcnRzIHRoZSB0aW1lbG9jay4AAAAAAAAHYXBwcm92ZQAAAAACAAAAAAAAAAZzaWduZXIAAAAAABMAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAHYmFsYW5jZQAAAAABAAAAAAAAAAV0b2tlbgAAAAAAABMAAAABAAAACw==",
        "AAAAAAAAAIxQdWxscyBgYW1vdW50YCBvZiBgdG9rZW5gIGZyb20gYGZyb21gIGludG8gdGhlIHZhdWx0LiBEaXJlY3QgdHJhbnNmZXJzCnRvIHRoZSB2YXVsdCBhZGRyZXNzIHdvcmsgdG9vOyB0aGlzIGV4aXN0cyBzbyBkZXBvc2l0cyBlbWl0IGFuIGV2ZW50LgAAAAdkZXBvc2l0AAAAAAMAAAAAAAAABGZyb20AAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAALRDYXJyaWVzIG91dCBhbiBhcHByb3ZlZCBwcm9wb3NhbC4gRGVsaWJlcmF0ZWx5IHBlcm1pc3Npb25sZXNzOiB0aGUKZ2F0ZSBpcyB0aGUgcHJvcG9zYWwncyBvd24gc3RhdGUsIG5vdCB0aGUgY2FsbGVyJ3MgaWRlbnRpdHksIHNvIGEKcmVsYXllciBjYW4gcGF5IHRoZSBmZWUgb24gdGhlIHNpZ25lcnMnIGJlaGFsZi4AAAAHZXhlY3V0ZQAAAAABAAAAAAAAAAJpZAAAAAAABAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAHxPcGVucyBhIHByb3Bvc2FsLiBUaGUgcHJvcG9zZXIncyBvd24gYXBwcm92YWwgaXMgcmVjb3JkZWQgaW1tZWRpYXRlbHksCnNvIGEgMS1vZi1OIHZhdWx0IGV4ZWN1dGVzIGFmdGVyIGEgc2luZ2xlIHJvdW5kIHRyaXAuAAAAB3Byb3Bvc2UAAAAAAgAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAAAAAAZhY3Rpb24AAAAAB9AAAAAGQWN0aW9uAAAAAAABAAAD6QAAAAQAAAAD",
        "AAAAAAAAAAAAAAAIcHJvcG9zYWwAAAABAAAAAAAAAAJpZAAAAAAABAAAAAEAAAPpAAAH0AAAAAhQcm9wb3NhbAAAAAM=",
        "AAAAAAAAAAAAAAAJaXNfc2lnbmVyAAAAAAAAAQAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAQAAAAE=",
        "AAAAAAAAAItQYWdlIHRocm91Z2ggcHJvcG9zYWxzIGZyb20gYHN0YXJ0YCwgb2xkZXN0IGZpcnN0LiBJZHMgd2hvc2UgZW50cmllcwpoYXZlIGV4cGlyZWQgb3V0IG9mIHN0b3JhZ2UgYXJlIHNraXBwZWQgcmF0aGVyIHRoYW4gYWJvcnRpbmcgdGhlIHBhZ2UuAAAAAAlwcm9wb3NhbHMAAAAAAAACAAAAAAAAAAVzdGFydAAAAAAAAAQAAAAAAAAABWxpbWl0AAAAAAAABAAAAAEAAAPqAAAH0AAAAAhQcm9wb3NhbA==",
        "AAAAAAAAACVgMGAgbWVhbnMgdGhlIHRva2VuIGhhcyBubyBkYWlseSBjYXAuAAAAAAAAC2RhaWx5X2xpbWl0AAAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAD1BbW91bnQgb2YgYHRva2VuYCBhbHJlYWR5IHNlbnQgb3V0IGluIHRoZSBjdXJyZW50IGRheSBidWNrZXQuAAAAAAAAC3NwZW50X3RvZGF5AAAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAL1DcmVhdGVzIHRoZSB2YXVsdC4gYHRpbWVsb2NrYCBpcyB0aGUgZGVsYXkgYmV0d2VlbiBhIHByb3Bvc2FsIHJlYWNoaW5nCml0cyB0aHJlc2hvbGQgYW5kIGJlY29taW5nIGV4ZWN1dGFibGU7IGBwcm9wb3NhbF90dGxgIGlzIGhvdyBsb25nIGEKcHJvcG9zYWwgc3RheXMgYWxpdmUgYmVmb3JlIGl0IGV4cGlyZXMgdW5leGVjdXRlZC4AAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAQAAAAAAAAAB3NpZ25lcnMAAAAD6gAAABMAAAAAAAAACXRocmVzaG9sZAAAAAAAAAQAAAAAAAAACHRpbWVsb2NrAAAABgAAAAAAAAAMcHJvcG9zYWxfdHRsAAAABgAAAAA=",
        "AAAAAAAAAAAAAAAOcHJvcG9zYWxfY291bnQAAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAIlBcHByb3ZhbHMgdGhhdCBzdGlsbCBjb3VudCwgaS5lLiB0aG9zZSBmcm9tIGFkZHJlc3NlcyB0aGF0IGFyZSBzaWduZXJzCnJpZ2h0IG5vdy4gVGhpcyBpcyB0aGUgbnVtYmVyIGBleGVjdXRlYCBjb21wYXJlcyB0byB0aGUgdGhyZXNob2xkLgAAAAAAAA92YWxpZF9hcHByb3ZhbHMAAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6QAAAAQAAAAD",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAEgAAAC1DYWxsZXIgaXMgbm90IHBhcnQgb2YgdGhlIGN1cnJlbnQgc2lnbmVyIHNldC4AAAAAAAAJTm90U2lnbmVyAAAAAAAAAQAAADZ0aHJlc2hvbGQgbXVzdCBzYXRpc2Z5IDEgPD0gdGhyZXNob2xkIDw9IHNpZ25lcnMubGVuKCkAAAAAABBJbnZhbGlkVGhyZXNob2xkAAAAAgAAADFUaGUgc2FtZSBhZGRyZXNzIGFwcGVhcnMgdHdpY2UgaW4gdGhlIHNpZ25lciBzZXQuAAAAAAAAD0R1cGxpY2F0ZVNpZ25lcgAAAAADAAAAL1NpZ25lciBzZXQgaXMgZW1wdHkgb3IgbGFyZ2VyIHRoYW4gTUFYX1NJR05FUlMuAAAAABBJbnZhbGlkU2lnbmVyU2V0AAAABAAAACBObyBwcm9wb3NhbCBleGlzdHMgd2l0aCB0aGlzIGlkLgAAABBQcm9wb3NhbE5vdEZvdW5kAAAABQAAAC5UaGlzIHNpZ25lciBoYXMgYWxyZWFkeSBhcHByb3ZlZCB0aGUgcHJvcG9zYWwuAAAAAAAPQWxyZWFkeUFwcHJvdmVkAAAAAAYAAAAmVGhpcyBzaWduZXIgaGFzIG5vIGFwcHJvdmFsIHRvIHJldm9rZS4AAAAAAAtOb3RBcHByb3ZlZAAAAAAHAAAAJVByb3Bvc2FsIGlzIG5vdCBpbiB0aGUgUGVuZGluZyBzdGF0ZS4AAAAAAAAKTm90UGVuZGluZwAAAAAACAAAADBWYWxpZCBhcHByb3ZhbHMgYXJlIGJlbG93IHRoZSBjdXJyZW50IHRocmVzaG9sZC4AAAAPVGhyZXNob2xkTm90TWV0AAAAAAkAAAAyVGhyZXNob2xkIGlzIG1ldCBidXQgdGhlIHRpbWVsb2NrIGhhcyBub3QgZWxhcHNlZC4AAAAAAA5UaW1lbG9ja0FjdGl2ZQAAAAAACgAAADJQcm9wb3NhbCBwYXNzZWQgaXRzIGV4cGlyeSB3aXRob3V0IGJlaW5nIGV4ZWN1dGVkLgAAAAAAB0V4cGlyZWQAAAAACwAAADBPbmx5IHRoZSBwcm9wb3NlciBtYXkgY2FuY2VsIHRoZWlyIG93biBwcm9wb3NhbC4AAAALTm90UHJvcG9zZXIAAAAADAAAACtUcmFuc2ZlciBhbW91bnRzIG11c3QgYmUgc3RyaWN0bHkgcG9zaXRpdmUuAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAADQAAAD1FeGVjdXRpbmcgdGhpcyB0cmFuc2ZlciB3b3VsZCBicmVhY2ggdGhlIHRva2VuJ3MgZGFpbHkgbGltaXQuAAAAAAAAEkRhaWx5TGltaXRFeGNlZWRlZAAAAAAADgAAABxBZGRyZXNzIGlzIGFscmVhZHkgYSBzaWduZXIuAAAADFNpZ25lckV4aXN0cwAAAA8AAAAxQWRkcmVzcyBpcyBub3QgYSBzaWduZXIsIHNvIGl0IGNhbm5vdCBiZSByZW1vdmVkLgAAAAAAAA1TaWduZXJNaXNzaW5nAAAAAAAAEAAAAEJSZW1vdmluZyB0aGlzIHNpZ25lciB3b3VsZCBsZWF2ZSBmZXdlciBzaWduZXJzIHRoYW4gdGhlIHRocmVzaG9sZC4AAAAAABRUaHJlc2hvbGRVbnJlYWNoYWJsZQAAABEAAABEU3BlbmQgbGltaXRzIGFuZCBUVExzIG11c3QgYmUgbm9uLW5lZ2F0aXZlIC8gbm9uLXplcm8gYXMgZG9jdW1lbnRlZC4AAAANSW52YWxpZENvbmZpZwAAAAAAABI=",
        "AAAAAgAAAJZFdmVyeXRoaW5nIHRoZSB2YXVsdCBjYW4gYmUgYXNrZWQgdG8gZG8uIEdvdmVybmFuY2UgY2hhbmdlcyBnbyB0aHJvdWdoIHRoZQpleGFjdCBzYW1lIE0tb2YtTiBwYXRoIGFzIHBheW91dHMg4oCUIHRoZXJlIGlzIG5vIHByaXZpbGVnZWQgYWRtaW4gYWRkcmVzcy4AAAAAAAAAAAAGQWN0aW9uAAAAAAAGAAAAAQAAAAAAAAAIVHJhbnNmZXIAAAABAAAH0AAAAAhUcmFuc2ZlcgAAAAEAAAAAAAAACUFkZFNpZ25lcgAAAAAAAAEAAAATAAAAAQAAAAAAAAAMUmVtb3ZlU2lnbmVyAAAAAQAAABMAAAABAAAAAAAAAAxTZXRUaHJlc2hvbGQAAAABAAAABAAAAAEAAAAAAAAADVNldERhaWx5TGltaXQAAAAAAAABAAAH0AAAAApTcGVuZExpbWl0AAAAAAABAAAAAAAAAAtTZXRUaW1lbG9jawAAAAABAAAABg==",
        "AAAAAQAAAAAAAAAAAAAABkNvbmZpZwAAAAAABAAAAC9MaWZldGltZSBvZiBhIHByb3Bvc2FsIGZyb20gY3JlYXRpb24gdG8gZXhwaXJ5LgAAAAAMcHJvcG9zYWxfdHRsAAAABgAAAAAAAAAHc2lnbmVycwAAAAPqAAAAEwAAAAAAAAAJdGhyZXNob2xkAAAAAAAABAAAAD1EZWxheSBiZXR3ZWVuIHJlYWNoaW5nIHRoZSB0aHJlc2hvbGQgYW5kIGJlY29taW5nIGV4ZWN1dGFibGUuAAAAAAAACHRpbWVsb2NrAAAABg==",
        "AAAAAgAAAAAAAAAAAAAABlN0YXR1cwAAAAAAAwAAAAAAAAAAAAAAB1BlbmRpbmcAAAAAAAAAAAAAAAAIRXhlY3V0ZWQAAAAAAAAAAAAAAAlDYW5jZWxsZWQAAAA=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAAAAAAAAAAAGTmV4dElkAAAAAAABAAAAAAAAAAhQcm9wb3NhbAAAAAEAAAAEAAAAAQAAABJ0b2tlbiAtPiBkYWlseSBjYXAAAAAAAAVMaW1pdAAAAAAAAAEAAAATAAAAAQAAACsodG9rZW4sIGRheSBidWNrZXQpIC0+IGFtb3VudCBhbHJlYWR5IHNwZW50AAAAAAVTcGVudAAAAAAAAAIAAAATAAAABg==",
        "AAAAAQAAAAAAAAAAAAAACFByb3Bvc2FsAAAACAAAAAAAAAAGYWN0aW9uAAAAAAfQAAAABkFjdGlvbgAAAAAAh1JhdyBhcHByb3ZhbCBsb2cuIE1heSBjb250YWluIGFkZHJlc3NlcyB0aGF0IGhhdmUgc2luY2UgYmVlbiByZW1vdmVkCmZyb20gdGhlIHNpZ25lciBzZXQsIHNvIGl0IGlzIG5ldmVyIHRydXN0ZWQgYXMgYSBjb3VudCBvbiBpdHMgb3duLgAAAAAJYXBwcm92YWxzAAAAAAAD6gAAABMAAAAAAAAACmNyZWF0ZWRfYXQAAAAAAAYAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAAmlkAAAAAAAEAAAAAAAAAAhwcm9wb3NlcgAAABMAAABGTGVkZ2VyIHRpbWUgYXQgd2hpY2ggZXhlY3V0aW9uIGJlY29tZXMgbGVnYWwuIGAwYCA9IHRocmVzaG9sZCBub3QgbWV0LgAAAAAACHJlYWR5X2F0AAAABgAAAAAAAAAGc3RhdHVzAAAAAAfQAAAABlN0YXR1cwAA",
        "AAAAAQAAAEpBIHRyZWFzdXJ5IHBheW91dC4gYHRva2VuYCBpcyBhbnkgU0VQLTQxIC8gU3RlbGxhciBBc3NldCBDb250cmFjdCBhZGRyZXNzLgAAAAAAAAAAAAhUcmFuc2ZlcgAAAAMAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAACdG8AAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEw==",
        "AAAAAQAAAEFBIHBlci10b2tlbiByb2xsaW5nIGRhaWx5IGNhcC4gYGRhaWx5X2xpbWl0ID09IDBgIG1lYW5zICJubyBjYXAiLgAAAAAAAAAAAAAKU3BlbmRMaW1pdAAAAAAAAgAAAAAAAAALZGFpbHlfbGltaXQAAAAACwAAAAAAAAAFdG9rZW4AAAAAAAAT",
        "AAAABQAAAAAAAAAAAAAAB1Jldm9rZWQAAAAAAQAAAAdyZXZva2VkAAAAAAQAAAAAAAAAAmlkAAAAAAAEAAAAAQAAAAAAAAAGc2lnbmVyAAAAAAATAAAAAAAAAAAAAAAFdmFsaWQAAAAAAAAEAAAAAAAAAAAAAAAJdGhyZXNob2xkAAAAAAAABAAAAAAAAAAC",
        "AAAABQAAAI9gdmFsaWRgIGlzIHRoZSBhcHByb3ZhbCBjb3VudCBtZWFzdXJlZCBhZ2FpbnN0IHRoZSBsaXZlIHNpZ25lciBzZXQsIHdoaWNoCmlzIHRoZSBudW1iZXIgdGhhdCBhY3R1YWxseSBkZWNpZGVzIHdoZXRoZXIgdGhlIHByb3Bvc2FsIGNhbiBleGVjdXRlLgAAAAAAAAAACEFwcHJvdmVkAAAAAQAAAAhhcHByb3ZlZAAAAAUAAAAAAAAAAmlkAAAAAAAEAAAAAQAAAAAAAAAGc2lnbmVyAAAAAAATAAAAAAAAAAAAAAAFdmFsaWQAAAAAAAAEAAAAAAAAAAAAAAAJdGhyZXNob2xkAAAAAAAABAAAAAAAAAAAAAAACHJlYWR5X2F0AAAABgAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAACEV4ZWN1dGVkAAAAAQAAAAhleGVjdXRlZAAAAAIAAAAAAAAAAmlkAAAAAAAEAAAAAQAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAACFByb3Bvc2VkAAAAAQAAAAhwcm9wb3NlZAAAAAMAAAAAAAAAAmlkAAAAAAAEAAAAAQAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAAAAAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAACUNhbmNlbGxlZAAAAAAAAAEAAAAJY2FuY2VsbGVkAAAAAAAAAgAAAAAAAAACaWQAAAAAAAQAAAABAAAAAAAAAAZzaWduZXIAAAAAABMAAAAAAAAAAg==",
        "AAAABQAAAI5Ub2tlbnMgYXJyaXZlZCB0aHJvdWdoIGBkZXBvc2l0YC4gRGlyZWN0IHRyYW5zZmVycyB0byB0aGUgdmF1bHQgYWRkcmVzcwpieXBhc3MgdGhpcywgd2hpY2ggaXMgd2h5IHRoZSBVSSByZWNvbmNpbGVzIGFnYWluc3QgYGJhbGFuY2VgIGFzIHdlbGwuAAAAAAAAAAAACURlcG9zaXRlZAAAAAAAAAEAAAAJZGVwb3NpdGVkAAAAAAAAAwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADExpbWl0Q2hhbmdlZAAAAAEAAAANbGltaXRfY2hhbmdlZAAAAAAAAAIAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAAAAAAC2RhaWx5X2xpbWl0AAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADUNvbmZpZ0NoYW5nZWQAAAAAAAABAAAADmNvbmZpZ19jaGFuZ2VkAAAAAAADAAAAAAAAAAxzaWduZXJfY291bnQAAAAEAAAAAAAAAAAAAAAJdGhyZXNob2xkAAAAAAAABAAAAAAAAAAAAAAACHRpbWVsb2NrAAAABgAAAAAAAAAC" ]),
      options
    )
  }
  public readonly fromJSON = {
    cancel: this.txFromJSON<Result<void>>,
        config: this.txFromJSON<Config>,
        revoke: this.txFromJSON<Result<void>>,
        approve: this.txFromJSON<Result<void>>,
        balance: this.txFromJSON<i128>,
        deposit: this.txFromJSON<Result<void>>,
        execute: this.txFromJSON<Result<void>>,
        propose: this.txFromJSON<Result<u32>>,
        proposal: this.txFromJSON<Result<Proposal>>,
        is_signer: this.txFromJSON<boolean>,
        proposals: this.txFromJSON<Array<Proposal>>,
        daily_limit: this.txFromJSON<i128>,
        spent_today: this.txFromJSON<i128>,
        proposal_count: this.txFromJSON<u32>,
        valid_approvals: this.txFromJSON<Result<u32>>
  }
}