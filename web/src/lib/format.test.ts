import assert from "node:assert/strict";
import { test } from "node:test";

import { formatAmount, parseAmount, relativeTime, shortAddress } from "./format";

test("formats base units with grouping and no trailing zeros", () => {
  assert.equal(formatAmount(1_000_000_000n, 7), "100");
  assert.equal(formatAmount(12_345_678_900n, 7), "1,234.56789");
  assert.equal(formatAmount(1n, 7), "0.0000001");
  assert.equal(formatAmount(0n, 7), "0");
});

test("formats negative amounts", () => {
  assert.equal(formatAmount(-15_000_000n, 7), "-1.5");
});

test("respects the token's own decimals", () => {
  assert.equal(formatAmount(1_500_000n, 6), "1.5");
  assert.equal(formatAmount(150n, 2), "1.5");
});

test("parses decimal input into base units", () => {
  assert.equal(parseAmount("1.5", 7), 15_000_000n);
  assert.equal(parseAmount("100", 7), 1_000_000_000n);
  assert.equal(parseAmount("0.0000001", 7), 1n);
});

test("refuses input it cannot represent exactly", () => {
  // Silently rounding here would send a different amount than the one the
  // signer read on the confirmation screen.
  assert.throws(() => parseAmount("1.12345678", 7), /7 decimal places/);
});

test("refuses amounts that are not positive numbers", () => {
  assert.throws(() => parseAmount("0", 7), /greater than zero/);
  assert.throws(() => parseAmount("-5", 7), /positive number/);
  assert.throws(() => parseAmount("abc", 7), /positive number/);
  assert.throws(() => parseAmount("", 7), /positive number/);
});

test("round-trips through parse and format", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["1", "1"],
    ["0.5", "0.5"],
    ["1234.5678", "1,234.5678"],
    ["0.0000001", "0.0000001"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(formatAmount(parseAmount(input, 7), 7), expected);
  }
});

test("shortens long addresses only", () => {
  assert.equal(shortAddress("GC65APLUR6Q3NBTBOKXOJQO47UWZ6EF437RWXSF2UKX3ARFQ7WRJLTNS"), "GC65…LTNS");
  assert.equal(shortAddress("short"), "short");
});

test("describes time relative to now", () => {
  const now = 1_700_000_000;
  assert.equal(relativeTime(now + 2_460, now), "in 41m");
  assert.equal(relativeTime(now - 518_400, now), "6d ago");
  assert.equal(relativeTime(now + 10, now), "now");
});
