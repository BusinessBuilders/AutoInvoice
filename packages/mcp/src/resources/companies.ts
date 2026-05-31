import { listCompaniesHandler } from "../tools/list_companies.js";
import type pg from "pg";

export const resourceSpec = {
  uri: "autoinvoice://companies",
  name: "Active Companies",
  description: "List of all active companies in AutoInvoice",
  mimeType: "application/json",
};

export async function readCompanies(pool?: pg.Pool): Promise<string> {
  const data = await listCompaniesHandler({}, pool);
  return JSON.stringify(data, null, 2);
}
