/**
 * Spend controls for the sponsor account.
 *
 * These are in-memory and therefore per-process: running several replicas
 * multiplies the effective budget. That is a deliberate trade for now — the
 * ceiling that actually bounds the loss is the balance of the sponsor account
 * itself, and the deployment guide says to fund it accordingly.
 */
export class SpendGuard {
  private day = -1;
  private spentToday = 0;
  private readonly recent = new Map<string, number[]>();

  constructor(
    private readonly dailyBudget: number,
    private readonly perAccountRate: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Rolls the daily bucket over when the UTC day changes. */
  private rollover(): void {
    const today = Math.floor(this.now() / 86_400_000);
    if (today !== this.day) {
      this.day = today;
      this.spentToday = 0;
    }
  }

  /**
   * Reserves `fee` stroops against the budget for `account`. Returns a reason
   * when the request is refused, or `undefined` when it may proceed.
   */
  reserve(account: string, fee: number): string | undefined {
    this.rollover();

    if (this.spentToday + fee > this.dailyBudget) {
      return "daily sponsorship budget exhausted";
    }

    const cutoff = this.now() - 60_000;
    const timestamps = (this.recent.get(account) ?? []).filter((at) => at > cutoff);
    if (timestamps.length >= this.perAccountRate) {
      return `rate limit reached: ${this.perAccountRate} sponsored transactions per minute`;
    }

    timestamps.push(this.now());
    this.recent.set(account, timestamps);
    this.spentToday += fee;
    return undefined;
  }

  /** Returns a reservation after a submission fails, so failures are free. */
  refund(fee: number): void {
    this.rollover();
    this.spentToday = Math.max(0, this.spentToday - fee);
  }

  get remainingToday(): number {
    this.rollover();
    return Math.max(0, this.dailyBudget - this.spentToday);
  }
}
