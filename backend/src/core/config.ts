import dotenv from "dotenv";

dotenv.config();

export const config = {
  appName: process.env.APP_NAME || "Local Cloud Manager",
  env: process.env.ENV || "dev",
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT) || 8000,
  apiToken: process.env.API_TOKEN || "dev-token",
};