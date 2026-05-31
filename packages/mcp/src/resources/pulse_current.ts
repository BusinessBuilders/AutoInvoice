import { getPulseHandler } from "../tools/get_pulse.js";
import type pg from "pg";

export const resourceSpec = {
  uri: "autoinvoice://pulse/current",
  name: "Current Week Pulse",
  description: "Cash pulse for the current ISO week — YTD net, per-company breakdown, data quality gaps",
  mimeType: "application/json",
};

export async function readPulseCurrent(pool?: pg.Pool): Promise<string> {
  const data = await getPulseHandler({}, pool);
  return JSON.stringify(data, null, 2);
}
