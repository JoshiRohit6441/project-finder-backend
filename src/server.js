import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { connectInfra } from "./infra.js";
import { seedAdmin } from "./modules/auth/auth.service.js";
import { seedMailbox } from "./modules/mailbox/mailbox.service.js";
import { getRuntimeSettings } from "./modules/settings/settings.service.js";
import { logger } from "./utils/logger.js";

async function start() {
  await connectInfra();
  await getRuntimeSettings();
  await Promise.all([seedAdmin(), seedMailbox()]);
  const app = createApp();
  const host = process.env.HOST || "0.0.0.0";
  app.listen(config.port, host, () => {
    logger.info({ host, port: config.port }, "api listening");
  });
}

start().catch((error) => {
  logger.error({ err: error }, "api failed to start");
  process.exit(1);
});
