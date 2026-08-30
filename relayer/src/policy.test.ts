import assert from "node:assert/strict";
import { test } from "node:test";

import {
  Account,
  Address,
  Asset,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
} from "@stellar/stellar-sdk";

import type { Config } from "./config.js";
import { inspect } from "./policy.js";

const VAULT = StrKey.encodeContract(Buffer.alloc(32, 7));
const OTHER_CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 9));

const config: Config = {
  port: 8787,
  network: "testnet",
  networkPassphrase: Networks.TESTNET,
  rpcUrl: "https://example.invalid",
  vaultContractId: VAULT,
  sponsor: Keypair.random(),
  maxInnerFee: 1_000_000,
  feeBumpFee: 200_000,
  dailyBudget: 50_000_000,
  perAccountRate: 10,
};

interface CallOptions {
  contract?: string;
  method?: string;
  fee?: string;
  sign?: boolean;
  extraOperation?: boolean;
}

function contractCall(signer: Keypair, options: CallOptions = {}): string {
  const builder = new TransactionBuilder(new Account(signer.publicKey(), "1"), {
    fee: options.fee ?? "100000",
    networkPassphrase: config.networkPassphrase,
  }).addOperation(
    Operation.invokeContractFunction({
      contract: options.contract ?? VAULT,
      function: options.method ?? "approve",
      args: [new Address(signer.publicKey()).toScVal(), nativeToScVal(0, { type: "u32" })],
    }),
  );

  if (options.extraOperation) {
    builder.addOperation(
      Operation.payment({
        destination: Keypair.random().publicKey(),
        asset: Asset.native(),
        amount: "100",
      }),
    );
  }

  const tx = builder.setTimeout(120).build();
  if (options.sign !== false) tx.sign(signer);
  return tx.toXDR();
}

test("accepts a signed vault call from a signer", () => {
  const signer = Keypair.random();
  const verdict = inspect(contractCall(signer), config);

  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;
  assert.equal(verdict.value.method, "approve");
  assert.equal(verdict.value.source, signer.publicKey());
});

test("refuses an envelope that is not a transaction", () => {
  const verdict = inspect("not-xdr", config);
  assert.equal(verdict.ok, false);
});

test("refuses an unsigned inner transaction", () => {
  const verdict = inspect(contractCall(Keypair.random(), { sign: false }), config);
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.match(verdict.reason, /unsigned/);
});

test("refuses a call to a contract that is not the vault", () => {
  const verdict = inspect(contractCall(Keypair.random(), { contract: OTHER_CONTRACT }), config);
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.match(verdict.reason, /not the sponsored vault/);
});

test("refuses a vault method outside the sponsored set", () => {
  const verdict = inspect(contractCall(Keypair.random(), { method: "deposit" }), config);
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.match(verdict.reason, /not sponsored/);
});

test("refuses an inner fee above the ceiling", () => {
  const verdict = inspect(contractCall(Keypair.random(), { fee: "9000000" }), config);
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.match(verdict.reason, /ceiling/);
});

test("refuses a batch that hides a second operation", () => {
  const verdict = inspect(contractCall(Keypair.random(), { extraOperation: true }), config);
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.match(verdict.reason, /exactly 1 operation/);
});

test("refuses a nested fee bump", () => {
  const signer = Keypair.random();
  const inner = TransactionBuilder.fromXDR(contractCall(signer), config.networkPassphrase);
  const bump = TransactionBuilder.buildFeeBumpTransaction(
    Keypair.random(),
    "200000",
    inner as never,
    config.networkPassphrase,
  );

  const verdict = inspect(bump.toXDR(), config);
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.match(verdict.reason, /already a fee-bump/);
});

test("refuses a plain payment", () => {
  const signer = Keypair.random();
  const tx = new TransactionBuilder(new Account(signer.publicKey(), "1"), {
    fee: "100000",
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: Keypair.random().publicKey(),
        asset: Asset.native(),
        amount: "100",
      }),
    )
    .setTimeout(120)
    .build();
  tx.sign(signer);

  const verdict = inspect(tx.toXDR(), config);
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.match(verdict.reason, /unsupported operation type/);
});
