import type { Config, Proposal } from "sigil-vault-client";

/**
 * Where a proposal sits from the current signer's point of view. The order
 * here is the order the dashboard shows them: what needs you, then what is
 * ready, then what is merely waiting, then history.
 */
export type Lane = "awaiting" | "ready" | "waiting" | "closed";

export const LANES: readonly Lane[] = ["awaiting", "ready", "waiting", "closed"];

export const LANE_TITLES: Record<Lane, string> = {
  awaiting: "Waiting for your approval",
  ready: "Ready to execute",
  waiting: "Collecting approvals",
  closed: "Closed",
};

export const LANE_EMPTY: Record<Lane, string> = {
  awaiting: "Nothing needs your approval.",
  ready: "Nothing is ready to execute yet.",
  waiting: "No proposals are collecting approvals.",
  closed: "No proposals have closed yet.",
};

/**
 * Approvals left by addresses that are no longer signers do not count — the
 * contract applies the same rule when it decides whether to execute.
 */
export function validApprovals(proposal: Proposal, config: Config): number {
  const signers = new Set(config.signers);
  return proposal.approvals.filter((approver) => signers.has(approver)).length;
}

export function isExpired(proposal: Proposal, now: number): boolean {
  return now > Number(proposal.expires_at);
}

export function isReady(proposal: Proposal, config: Config, now: number): boolean {
  return (
    proposal.status.tag === "Pending" &&
    !isExpired(proposal, now) &&
    proposal.ready_at > 0n &&
    now >= Number(proposal.ready_at) &&
    validApprovals(proposal, config) >= config.threshold
  );
}

export function classify(
  proposal: Proposal,
  config: Config,
  viewer: string | undefined,
  now: number,
): Lane {
  if (proposal.status.tag !== "Pending" || isExpired(proposal, now)) return "closed";
  if (isReady(proposal, config, now)) return "ready";

  // Once quorum is reached the proposal is waiting on the timelock, not on
  // anyone's signature — asking a remaining signer to approve would be noise.
  const needsMoreApprovals = validApprovals(proposal, config) < config.threshold;
  const viewerIsSigner = viewer !== undefined && config.signers.includes(viewer);
  if (needsMoreApprovals && viewerIsSigner && !proposal.approvals.includes(viewer)) {
    return "awaiting";
  }
  return "waiting";
}

export function group(
  proposals: readonly Proposal[],
  config: Config,
  viewer: string | undefined,
  now: number,
): Record<Lane, Proposal[]> {
  const lanes: Record<Lane, Proposal[]> = { awaiting: [], ready: [], waiting: [], closed: [] };
  for (const proposal of proposals) {
    lanes[classify(proposal, config, viewer, now)].push(proposal);
  }
  // Newest first within each lane: the most recent decision is the live one.
  for (const lane of LANES) lanes[lane].sort((a, b) => b.id - a.id);
  return lanes;
}

/** Plain-language label for what a proposal will do if it executes. */
export function describeStatus(proposal: Proposal, now: number): string {
  if (proposal.status.tag === "Executed") return "Executed";
  if (proposal.status.tag === "Cancelled") return "Cancelled";
  return isExpired(proposal, now) ? "Expired" : "Pending";
}
