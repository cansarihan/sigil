/** Renders a base-unit amount using the token's declared decimals. */
export function formatAmount(base: bigint, decimals: number): string {
  const negative = base < 0n;
  const digits = (negative ? -base : base).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");

  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/**
 * Parses a decimal string into base units. Rejects anything it cannot
 * represent exactly rather than rounding someone's payment.
 */
export function parseAmount(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a positive number, for example 12.5");
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new Error(`This token has ${decimals} decimal places`);
  }
  const base = BigInt(whole + fraction.padEnd(decimals, "0"));
  if (base <= 0n) throw new Error("Amount must be greater than zero");
  return base;
}

export function shortAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}

const UNITS: ReadonlyArray<readonly [number, string]> = [
  [86_400, "d"],
  [3_600, "h"],
  [60, "m"],
];

/** "in 41m", "6d ago", "now" — from a unix timestamp in seconds. */
export function relativeTime(timestamp: number, now = Date.now() / 1000): string {
  const delta = Math.round(timestamp - now);
  const magnitude = Math.abs(delta);
  if (magnitude < 60) return "now";

  const unit = UNITS.find(([seconds]) => magnitude >= seconds) ?? UNITS[UNITS.length - 1]!;
  const value = Math.floor(magnitude / unit[0]);
  return delta > 0 ? `in ${value}${unit[1]}` : `${value}${unit[1]} ago`;
}
