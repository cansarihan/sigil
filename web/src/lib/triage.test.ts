import assert from "node:assert/strict";
import { test } from "node:test";
import type { Config, Proposal } from "sigil-vault-client";

import { classify, group, isReady, validApprovals } from "./triage";

const [ALICE, BOB, CAROL, MALLORY] = ["GALICE", "GBOB", "GCAROL", "GMALLORY"];
const NOW = 1_700_000_000;

const config: Config = {
  signers: [ALICE!, BOB!, CAROL!],
  threshold: 2,
  timelock: 0n,
  proposal_ttl: 604_800n,
};

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 1,
    proposer: ALICE!,
    action: { tag: "SetThreshold", values: [2] },
    approvals: [ALICE!],
    status: { tag: "Pending", values: undefined },
    created_at: BigInt(NOW - 100),
    ready_at: 0n,
    expires_at: BigInt(NOW + 86_400),
    ...overrides,
  };
}

test("counts only approvals from current signers", () => {
  const stale = proposal({ approvals: [ALICE!, MALLORY!] });
  assert.equal(validApprovals(stale, config), 1);
});

test("a proposal needing the viewer lands in the awaiting lane", () => {
  assert.equal(classify(proposal(), config, BOB, NOW), "awaiting");
});

test("a proposal the viewer already approved is merely waiting", () => {
  assert.equal(classify(proposal(), config, ALICE, NOW), "waiting");
});

test("a non-signer never sees anything as awaiting them", () => {
  assert.equal(classify(proposal(), config, MALLORY, NOW), "waiting");
  assert.equal(classify(proposal(), config, undefined, NOW), "waiting");
});

test("a proposal past its threshold and timelock is ready", () => {
  const ready = proposal({ approvals: [ALICE!, BOB!], ready_at: BigInt(NOW - 1) });
  assert.equal(isReady(ready, config, NOW), true);
  assert.equal(classify(ready, config, CAROL, NOW), "ready");
});

test("a proposal still inside its timelock is not ready", () => {
  const held = proposal({ approvals: [ALICE!, BOB!], ready_at: BigInt(NOW + 600) });
  assert.equal(isReady(held, config, NOW), false);
  assert.equal(classify(held, config, CAROL, NOW), "waiting");
});

test("losing a signer drops a proposal back out of the ready lane", () => {
  const ready = proposal({ approvals: [ALICE!, BOB!], ready_at: BigInt(NOW - 1) });
  const withoutBob: Config = { ...config, signers: [ALICE!, CAROL!] };

  assert.equal(isReady(ready, withoutBob, NOW), false);
  assert.equal(classify(ready, withoutBob, CAROL, NOW), "awaiting");
});

test("executed, cancelled and expired proposals are all closed", () => {
  const executed = proposal({ status: { tag: "Executed", values: undefined } });
  const cancelled = proposal({ status: { tag: "Cancelled", values: undefined } });
  const expired = proposal({ expires_at: BigInt(NOW - 1) });

  for (const closed of [executed, cancelled, expired]) {
    assert.equal(classify(closed, config, BOB, NOW), "closed");
  }
});

test("grouping sorts each lane newest first", () => {
  const lanes = group(
    [proposal({ id: 1 }), proposal({ id: 3 }), proposal({ id: 2 })],
    config,
    BOB,
    NOW,
  );
  assert.deepEqual(
    lanes.awaiting.map((p) => p.id),
    [3, 2, 1],
  );
});

test("a signer is not nagged to approve a proposal that already has quorum", () => {
  const held = proposal({ approvals: [ALICE!, BOB!], ready_at: BigInt(NOW + 600) });
  assert.equal(classify(held, config, CAROL, NOW), "waiting");
});
