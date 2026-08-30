import assert from "node:assert/strict";
import { test } from "node:test";

import { SpendGuard } from "./budget.js";

/** A clock the test moves by hand, so nothing here depends on wall time. */
function clock(start = 1_700_000_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

test("allows spending up to the daily budget", () => {
  const guard = new SpendGuard(1_000, 10, clock().now);

  assert.equal(guard.reserve("alice", 400), undefined);
  assert.equal(guard.reserve("alice", 600), undefined);
  assert.equal(guard.remainingToday, 0);
});

test("refuses the request that would cross the daily budget", () => {
  const guard = new SpendGuard(1_000, 10, clock().now);
  guard.reserve("alice", 900);

  assert.match(guard.reserve("alice", 200) ?? "", /budget exhausted/);
  assert.equal(guard.remainingToday, 100, "the refused amount is not charged");
});

test("the budget refreshes on the next UTC day", () => {
  const time = clock();
  const guard = new SpendGuard(1_000, 10, time.now);
  guard.reserve("alice", 1_000);
  assert.equal(guard.remainingToday, 0);

  time.advance(86_400_000);

  assert.equal(guard.remainingToday, 1_000);
  assert.equal(guard.reserve("alice", 500), undefined);
});

test("rate limits each account independently", () => {
  const guard = new SpendGuard(1_000_000, 2, clock().now);

  assert.equal(guard.reserve("alice", 1), undefined);
  assert.equal(guard.reserve("alice", 1), undefined);
  assert.match(guard.reserve("alice", 1) ?? "", /rate limit/);

  assert.equal(guard.reserve("bob", 1), undefined, "bob is unaffected by alice");
});

test("the rate limit window rolls forward", () => {
  const time = clock();
  const guard = new SpendGuard(1_000_000, 1, time.now);
  guard.reserve("alice", 1);
  assert.match(guard.reserve("alice", 1) ?? "", /rate limit/);

  time.advance(61_000);

  assert.equal(guard.reserve("alice", 1), undefined);
});

test("a refund returns the reservation to the budget", () => {
  const guard = new SpendGuard(1_000, 10, clock().now);
  guard.reserve("alice", 800);
  assert.equal(guard.remainingToday, 200);

  guard.refund(800);

  assert.equal(guard.remainingToday, 1_000);
});

test("a refused request never consumes the rate limit slot it was denied for", () => {
  const guard = new SpendGuard(100, 5, clock().now);

  assert.match(guard.reserve("alice", 500) ?? "", /budget exhausted/);
  assert.equal(guard.reserve("alice", 50), undefined, "alice still has her slots");
});
