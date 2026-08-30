import express, { type Express, type Request, type Response } from "express";

import type { Config } from "./config.js";
import { SpendGuard } from "./budget.js";
import { inspect } from "./policy.js";
import { costOf, Sponsor, SubmissionError } from "./sponsor.js";

/** Methods that only a current vault signer may have sponsored. */
const SIGNER_ONLY = new Set(["propose", "approve", "revoke", "cancel"]);

export function createServer(config: Config, sponsor: Sponsor, guard: SpendGuard): Express {
  const app = express();
  // Envelopes are a few KB at most; a small cap keeps a flood cheap to refuse.
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", async (_request: Request, response: Response) => {
    let balance = "unknown";
    try {
      balance = await sponsor.balance();
    } catch {
      // A missing balance means the RPC is unreachable, not that we are down.
    }
    response.json({
      status: "ok",
      network: config.network,
      vault: config.vaultContractId,
      sponsor: sponsor.address,
      sponsorBalanceStroops: balance,
      remainingBudgetStroops: guard.remainingToday,
    });
  });

  /**
   * Fee-bumps a transaction the client already signed. The client keeps full
   * authorship: we add an outer envelope that pays, and nothing else.
   */
  app.post("/sponsor", async (request: Request, response: Response) => {
    const envelope = request.body?.xdr;
    if (typeof envelope !== "string" || envelope.length === 0) {
      response.status(400).json({ error: "body must be { xdr: string }" });
      return;
    }

    const verdict = inspect(envelope, config);
    if (!verdict.ok) {
      response.status(400).json({ error: verdict.reason });
      return;
    }
    const { tx, method, source, fee } = verdict.value;

    if (SIGNER_ONLY.has(method) && !(await sponsor.isSigner(source))) {
      response.status(403).json({ error: `${source} is not a signer of this vault` });
      return;
    }

    const cost = costOf(config, fee);
    const refused = guard.reserve(source, cost);
    if (refused) {
      response.status(429).json({ error: refused });
      return;
    }

    try {
      const settlement = await sponsor.sponsor({ tx, method, source, fee });
      response.json({ ...settlement, sponsoredFeeStroops: cost });
    } catch (error) {
      guard.refund(cost);
      respondToFailure(response, error);
    }
  });

  /**
   * Settles a proposal with no client signature at all. `execute` is
   * permissionless on-chain, so the relayer can carry the whole transaction —
   * this is the path that lets a signer with zero XLM finish a payout.
   */
  app.post("/execute", async (request: Request, response: Response) => {
    const id = request.body?.id;
    if (!Number.isInteger(id) || id < 0) {
      response.status(400).json({ error: "body must be { id: non-negative integer }" });
      return;
    }

    const cost = costOf(config, config.feeBumpFee);
    const bucket = request.ip ?? "unknown";
    const refused = guard.reserve(bucket, cost);
    if (refused) {
      response.status(429).json({ error: refused });
      return;
    }

    try {
      const settlement = await sponsor.execute(id);
      response.json({ ...settlement, sponsoredFeeStroops: cost });
    } catch (error) {
      guard.refund(cost);
      respondToFailure(response, error);
    }
  });

  return app;
}

/**
 * Submission failures are the network's verdict, not the caller's mistake, so
 * they surface as 502 with the hash needed to look the attempt up.
 */
function respondToFailure(response: Response, error: unknown): void {
  if (error instanceof SubmissionError) {
    response.status(502).json({ error: error.message, hash: error.hash });
    return;
  }
  response.status(502).json({ error: error instanceof Error ? error.message : "submission failed" });
}
