import type { Config, Proposal } from "sigil-vault-client";

import { relativeTime, shortAddress } from "../lib/format";
import { classify, describeStatus, isReady, validApprovals, type Lane } from "../lib/triage";
import { ActionSummary } from "./ActionSummary";
import { Seal, type SealTone } from "./Seal";

export type ProposalAction = "approve" | "revoke" | "cancel" | "execute";

interface ProposalCardProps {
  readonly proposal: Proposal;
  readonly config: Config;
  readonly viewer: string | undefined;
  readonly now: number;
  readonly busy: boolean;
  readonly onAct: (action: ProposalAction, id: number) => void;
}

export function ProposalCard({
  proposal,
  config,
  viewer,
  now,
  busy,
  onAct,
}: ProposalCardProps) {
  const lane = classify(proposal, config, viewer, now);
  const approvals = validApprovals(proposal, config);
  const status = describeStatus(proposal, now);
  const ready = isReady(proposal, config, now);

  const viewerIsSigner = viewer !== undefined && config.signers.includes(viewer);
  const viewerApproved = viewer !== undefined && proposal.approvals.includes(viewer);
  const open = proposal.status.tag === "Pending" && status === "Pending";

  return (
    <article className="proposal" data-lane={lane}>
      <Seal total={config.signers.length} filled={approvals} tone={toneFor(lane, status)} />

      <div className="proposal-body">
        <h3 className="proposal-title">
          <span className="proposal-id">#{proposal.id}</span>
          <span>
            <ActionSummary action={proposal.action} />
          </span>
        </h3>

        <ul className="proposal-facts">
          <li>
            {approvals} of {config.threshold} approvals
          </li>
          <li>by {shortAddress(proposal.proposer)}</li>
          {open && proposal.ready_at > 0n && !ready && (
            <li>executable {relativeTime(Number(proposal.ready_at), now)}</li>
          )}
          {open && <li>expires {relativeTime(Number(proposal.expires_at), now)}</li>}
          {!open && <li>{status.toLowerCase()}</li>}
        </ul>

        {open && viewerIsSigner && (
          <div className="proposal-actions">
            {!viewerApproved && (
              <button
                className="button"
                data-kind={lane === "awaiting" ? "primary" : undefined}
                disabled={busy}
                onClick={() => onAct("approve", proposal.id)}
              >
                Approve
              </button>
            )}
            {viewerApproved && (
              <button
                className="button"
                data-kind="quiet"
                disabled={busy}
                onClick={() => onAct("revoke", proposal.id)}
              >
                Withdraw approval
              </button>
            )}
            {ready && (
              <button
                className="button"
                data-kind="primary"
                disabled={busy}
                onClick={() => onAct("execute", proposal.id)}
              >
                Execute
              </button>
            )}
            {proposal.proposer === viewer && (
              <button
                className="button"
                data-kind="quiet"
                disabled={busy}
                onClick={() => onAct("cancel", proposal.id)}
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function toneFor(lane: Lane, status: string): SealTone {
  if (status === "Executed") return "settled";
  if (status === "Cancelled" || status === "Expired") return "void";
  return lane === "ready" ? "quorum" : "collecting";
}
