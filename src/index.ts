#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { baInit, baInitSchema } from "./tools/baInit.js";
import { baGet, baGetSchema, baList, baListSchema } from "./tools/baQuery.js";
import { baSessionStart, baSessionStartSchema } from "./tools/baSessionStart.js";
import { baAssess, baAssessSchema } from "./tools/baAssess.js";
import { baRecordAnswers, baRecordAnswersSchema } from "./tools/baRecordAnswers.js";
import { baApply, baApplySchema } from "./tools/baApply.js";
import { baStatus, baStatusSchema } from "./tools/baStatus.js";
import { baPlan, baPlanSchema } from "./tools/baPlan.js";
import { baFinalize, baFinalizeSchema } from "./tools/baFinalize.js";
import { baImpact, baImpactSchema } from "./tools/baImpact.js";
import { INSTRUCTIONS } from "./instructions.js";

export { INSTRUCTIONS } from "./instructions.js";
export const VERSION = "0.3.0";

type Handler = (args: any) => unknown;

export function wrap(handler: Handler) {
  return async (args: unknown) => {
    try {
      const result = await handler(args);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
      };
    }
  };
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: "eazy-ba", version: VERSION }, { instructions: INSTRUCTIONS });
  server.registerTool("ba_init",
    { description: "Scaffold the docs/ba BA docs tree.", inputSchema: baInitSchema.shape }, wrap(baInit));
  server.registerTool("ba_session_start",
    { description: "Start or resume a BA session (mode: discovery | stabilize).", inputSchema: baSessionStartSchema.shape }, wrap(baSessionStart));
  server.registerTool("ba_assess",
    { description: "Analyze current state and return the questions to ask the user. Writes no BA documents (it only updates session state).", inputSchema: baAssessSchema.shape }, wrap(baAssess));
  server.registerTool("ba_record_answers",
    { description: "Record the user's answers as traceable decisions.", inputSchema: baRecordAnswersSchema.shape }, wrap(baRecordAnswers));
  server.registerTool("ba_apply",
    { description: "Materialize/update documents from recorded decisions. Every artifact must cite derived_from decisions.", inputSchema: baApplySchema.shape }, wrap(baApply));
  server.registerTool("ba_status",
    { description: "Report open questions, gaps, pending decisions, the open coverage plan, and stability.", inputSchema: baStatusSchema.shape }, wrap(baStatus));
  server.registerTool("ba_plan",
    { description: "Declare or retire agent/user coverage topics (the visible, steerable coverage plan on top of the floor). Declaring is idempotent; retiring stops a topic from gating stability. Returns the current open plan.", inputSchema: baPlanSchema.shape }, wrap(baPlan));
  server.registerTool("ba_finalize",
    { description: "Promote every draft BA document (persona/fr/nfr/use-case/story/glossary/tech-surface) to status 'reviewed' in one batch — the clean 'here are your docs' step. Idempotent and repeatable: a second call with nothing in draft is a no-op, and it promotes again after a change loop re-opens work. Only changes status; never touches backing. Returns what was promoted.", inputSchema: baFinalizeSchema.shape }, wrap(baFinalize));
  server.registerTool("ba_impact",
    { description: "For a mid-project change: report blast radius, conflicts, severity, consequences, and change questions for the given target ids. Creates nothing.", inputSchema: baImpactSchema.shape }, wrap(baImpact));
  server.registerTool("ba_get",
    { description: "Get one artifact by id.", inputSchema: baGetSchema.shape }, wrap(baGet));
  server.registerTool("ba_list",
    { description: "List artifacts filtered by type/status/priority/tag.", inputSchema: baListSchema.shape }, wrap(baList));
  return server;
}

async function main() {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}

// True when this file is the process entry point — including when launched
// through a symlinked bin (npx, global install, `claude mcp add`), where
// process.argv[1] is the symlink path but import.meta.url is the resolved
// real path. Resolving symlinks on both sides makes the comparison robust.
export function invokedAsBinary(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedAsBinary()) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
