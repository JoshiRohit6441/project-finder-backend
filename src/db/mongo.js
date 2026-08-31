import mongoose from "mongoose";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

async function connectMongo() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongoUri);
  logger.info("mongo connected");
}

async function disconnectMongo() {
  await mongoose.disconnect();
}

export { connectMongo, disconnectMongo };
