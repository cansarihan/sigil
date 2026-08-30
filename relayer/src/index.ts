import { SpendGuard } from "./budget.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { Sponsor } from "./sponsor.js";

const config = loadConfig();
const sponsor = new Sponsor(config);
const guard = new SpendGuard(config.dailyBudget, config.perAccountRate);

createServer(config, sponsor, guard).listen(config.port, () => {
  console.log(
    `sigil relayer on :${config.port} — network=${config.network} ` +
      `vault=${config.vaultContractId} sponsor=${sponsor.address}`,
  );
});
