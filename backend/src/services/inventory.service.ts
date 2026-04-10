import { logger } from "../core/logger";

export async function loadInventory() {
  logger.warn(
    "loadInventory() was called, but PCM now treats the database as the only VM source of truth and does not load a startup inventory file.",
  );
}
