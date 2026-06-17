/** Tool registry — the single shared surface for the MCP server (server.ts)
 * and the one-shot agent CLI (cli.ts). Both call the same handlers, so there
 * is exactly one query path per tool — no SQL drift between MCP and CLI. */

export const TOOLS: Array<{ name: string; description: string; inputSchema: any }> = [];
export const HANDLERS: Record<string, (input: unknown) => Promise<unknown>> = {};

import { listCompaniesHandler, toolSpec as listCompaniesSpec } from "./tools/list_companies.js";
TOOLS.push(listCompaniesSpec);
HANDLERS["list_companies"] = listCompaniesHandler;

import { getPulseHandler, toolSpec as getPulseSpec } from "./tools/get_pulse.js";
TOOLS.push(getPulseSpec);
HANDLERS["get_pulse"] = getPulseHandler;

import { getCompanyCashflowHandler, toolSpec as getCompanyCashflowSpec } from "./tools/get_company_cashflow.js";
TOOLS.push(getCompanyCashflowSpec);
HANDLERS["get_company_cashflow"] = getCompanyCashflowHandler;

import { getSuperNovaBurnHandler, toolSpec as getSuperNovaBurnSpec } from "./tools/get_super_nova_burn.js";
TOOLS.push(getSuperNovaBurnSpec);
HANDLERS["get_super_nova_burn"] = getSuperNovaBurnHandler;

import { getDsoHandler, toolSpec as getDsoSpec } from "./tools/get_dso.js";
TOOLS.push(getDsoSpec);
HANDLERS["get_dso"] = getDsoHandler;

import { projectCashHandler, toolSpec as projectCashSpec } from "./tools/project_cash.js";
TOOLS.push(projectCashSpec);
HANDLERS["project_cash"] = projectCashHandler;

import { markReconciliationHandler, toolSpec as markReconciliationSpec } from "./tools/mark_reconciliation.js";
TOOLS.push(markReconciliationSpec);
HANDLERS["mark_reconciliation"] = markReconciliationHandler;

// Business OS tools (docs/BUSINESS_OS_SPEC.md §5)
import { createLeadHandler, toolSpec as createLeadSpec } from "./tools/create_lead.js";
TOOLS.push(createLeadSpec);
HANDLERS["create_lead"] = createLeadHandler;

import { logActivityHandler, toolSpec as logActivitySpec } from "./tools/log_activity.js";
TOOLS.push(logActivitySpec);
HANDLERS["log_activity"] = logActivityHandler;

import { getCustomer360Handler, toolSpec as getCustomer360Spec } from "./tools/get_customer_360.js";
TOOLS.push(getCustomer360Spec);
HANDLERS["get_customer_360"] = getCustomer360Handler;

import { ingestOrderHandler, toolSpec as ingestOrderSpec } from "./tools/ingest_order.js";
TOOLS.push(ingestOrderSpec);
HANDLERS["ingest_order"] = ingestOrderHandler;

import {
  agingQuotesSpec, listAgingQuotesHandler,
  attributionSpec, getAttributionReportHandler,
  mrrSpec, getMrrHandler,
  pipelineSpec, getPipelineHandler,
  jobsTodaySpec, listJobsTodayHandler,
  revenueSummarySpec, getRevenueSummaryHandler,
} from "./tools/business_os_reports.js";
TOOLS.push(agingQuotesSpec, attributionSpec, mrrSpec, pipelineSpec, jobsTodaySpec, revenueSummarySpec);
HANDLERS["list_aging_quotes"] = listAgingQuotesHandler;
HANDLERS["get_attribution_report"] = getAttributionReportHandler;
HANDLERS["get_mrr"] = getMrrHandler;
HANDLERS["get_pipeline"] = getPipelineHandler;
HANDLERS["list_jobs_today"] = listJobsTodayHandler;
HANDLERS["get_revenue_summary"] = getRevenueSummaryHandler;

import { searchTransactionsHandler, toolSpec as searchTransactionsSpec } from "./tools/search_transactions.js";
TOOLS.push(searchTransactionsSpec);
HANDLERS["search_transactions"] = searchTransactionsHandler;

import { createInvoiceHandler, toolSpec as createInvoiceSpec } from "./tools/create_invoice.js";
TOOLS.push(createInvoiceSpec);
HANDLERS["create_invoice"] = createInvoiceHandler;
