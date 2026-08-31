import pino from "pino";
import { config } from "../config/index.js";

const logger = pino({
  level: config.logLevel,
  transport:
    config.env === "development"
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        }
      : undefined,
});

export { logger };
