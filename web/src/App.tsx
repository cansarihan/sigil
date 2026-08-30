import { useCallback, useEffect, useState } from "react";
import type { Action } from "sigil-vault-client";

import { Headline } from "./components/Headline";
import { NewProposal } from "./components/NewProposal";
import { ProposalCard, type ProposalAction } from "./components/ProposalCard";
import { config, explorerAccount, explorerTx } from "./lib/config";
import { useNow } from "./lib/hooks";
import * as relayer from "./lib/relayer";
import { shortAddress } from "./lib/format";
import { LANE_EMPTY, LANE_TITLES, LANES, group } from "./lib/triage";
import * as vault from "./lib/vault";
import { connect, currentAddress, walletAvailable } from "./lib/wallet";

interface Notice {
  readonly tone: "ok" | "error";
  readonly message: string;
  readonly hash?: string;
}

export function App() {
  const now = useNow();
  const [address, setAddress] = useState<string>();
  const [hasWallet, setHasWallet] = useState(true);
  const [state, setState] = useState<vault.VaultState>();
  const [balance, setBalance] = useState<bigint>();
  const [limit, setLimit] = useState<{ limit: bigint; spent: bigint }>();
  const [sponsor, setSponsor] = useState<relayer.RelayerStatus>();
  const [gasless, setGasless] = useState(true);
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>();

  const refresh = useCallback(async () => {
    const [loaded, held, cap] = await Promise.all([
      vault.readVault(),
      vault.readBalance(config.nativeToken),
      vault.readDailyLimit(config.nativeToken),
    ]);
    setState(loaded);
    setBalance(held);
    setLimit(cap);
  }, []);

  useEffect(() => {
    if (!config.vaultId) {
      setNotice({ tone: "error", message: "VITE_VAULT_ID is not set. Point the app at a vault." });
      return;
    }
    refresh().catch((error) => setNotice({ tone: "error", message: describe(error) }));
    relayer.status().then(setSponsor);
    walletAvailable().then((available) => {
      setHasWallet(available);
      if (available) currentAddress().then(setAddress);
    });
  }, [refresh]);

  // The relayer only appears as an option once it answers and confirms it
  // sponsors this vault; otherwise the switch would promise something untrue.
  const feeMode: vault.FeeMode = gasless && sponsor ? "relayer" : "self";

  async function run(label: string, work: () => Promise<vault.Settlement>) {
    setBusy(true);
    setNotice(undefined);
    try {
      const { hash } = await work();
      setNotice({ tone: "ok", message: `${label} submitted.`, ...(hash ? { hash } : {}) });
      setComposing(false);
      await refresh();
    } catch (error) {
      setNotice({ tone: "error", message: describe(error) });
    } finally {
      setBusy(false);
    }
  }

  const onAct = (action: ProposalAction, id: number) => {
    if (!address) return;
    const verbs: Record<ProposalAction, string> = {
      approve: "Approval",
      revoke: "Withdrawal",
      cancel: "Cancellation",
      execute: "Execution",
    };
    void run(verbs[action], () => vault[action](address, id, feeMode));
  };

  const onPropose = (action: Action) => {
    if (!address) return;
    void run("Proposal", () => vault.propose(address, action, feeMode));
  };

  const lanes = state ? group(state.proposals, state.config, address, now) : undefined;
  const isSigner = state !== undefined && address !== undefined && state.config.signers.includes(address);

  return (
    <div className="shell">
      <header className="masthead">
        <h1 className="wordmark">
          Sigil<span>.</span>
        </h1>
        <p className="eyebrow">Multisig treasury on Stellar</p>

        <div className="masthead-meta">
          <span className="chip">
            <span className="dot" data-tone={config.network === "mainnet" ? undefined : "warn"} />
            {config.network}
          </span>
          {sponsor && (
            <label className="switch">
              <input
                type="checkbox"
                checked={gasless}
                onChange={(event) => setGasless(event.target.checked)}
              />
              <span className="switch-track" />
              Relayer pays fees
            </label>
          )}
          {address ? (
            <a className="chip mono" href={explorerAccount(address)} target="_blank" rel="noreferrer">
              {shortAddress(address)}
            </a>
          ) : (
            <button
              className="button"
              disabled={!hasWallet}
              onClick={() =>
                connect()
                  .then(setAddress)
                  .catch((error) => setNotice({ tone: "error", message: describe(error) }))
              }
            >
              {hasWallet ? "Connect Freighter" : "Freighter not found"}
            </button>
          )}
        </div>
      </header>

      {state && (
        <Headline
          vaultConfig={state.config}
          balance={balance}
          limit={limit}
          viewer={address}
        />
      )}

      {notice && (
        <p className="notice" data-tone={notice.tone}>
          {notice.message}
          {notice.hash && (
            <>
              {" "}
              <a href={explorerTx(notice.hash)} target="_blank" rel="noreferrer">
                View on the explorer
              </a>
            </>
          )}
        </p>
      )}

      {isSigner && state && (
        <div className="lane">
          {composing ? (
            <NewProposal
              vaultConfig={state.config}
              busy={busy}
              onSubmit={onPropose}
              onCancel={() => setComposing(false)}
            />
          ) : (
            <button className="button" data-kind="primary" onClick={() => setComposing(true)}>
              New proposal
            </button>
          )}
        </div>
      )}

      {address && state && !isSigner && (
        <p className="notice">
          You are connected, but <span className="mono">{shortAddress(address)}</span> is not a
          signer of this vault. You can watch, not act.
        </p>
      )}

      {lanes &&
        state &&
        LANES.map((lane) => (
          <section className="lane" data-lane={lane} key={lane}>
            <div className="lane-head">
              <h2>{LANE_TITLES[lane]}</h2>
              <span className="rule" />
              <span className="count">{lanes[lane].length}</span>
            </div>
            {lanes[lane].length === 0 ? (
              <p className="empty">{LANE_EMPTY[lane]}</p>
            ) : (
              lanes[lane].map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  config={state.config}
                  viewer={address}
                  now={now}
                  busy={busy}
                  onAct={onAct}
                />
              ))
            )}
          </section>
        ))}

      {!state && !notice && <p className="empty">Reading the vault…</p>}
    </div>
  );
}

/** Contract errors arrive already named by the generated client; keep that. */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
