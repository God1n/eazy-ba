import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { baInit, baInitSchema } from "./tools/baInit.js";
import { baCreateArtifact, baCreateSchema } from "./tools/baCreateArtifact.js";
import { baUpdateArtifact, baUpdateSchema } from "./tools/baUpdateArtifact.js";
import { baLink, baLinkSchema } from "./tools/baLink.js";
import { baGet, baGetSchema, baList, baListSchema } from "./tools/baQuery.js";

export const VERSION = "0.1.0";

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
  const server = new McpServer({ name: "eazy-ba", version: VERSION });
  server.registerTool("ba_init",
    { description: "Scaffold the docs/ba BA docs tree.", inputSchema: baInitSchema.shape },
    wrap(baInit));
  server.registerTool("ba_create_artifact",
    { description: "Create a persona/fr/nfr/use-case/story artifact.", inputSchema: baCreateSchema.shape },
    wrap(baCreateArtifact));
  server.registerTool("ba_update_artifact",
    { description: "Update an artifact; bumps version and logs the change.", inputSchema: baUpdateSchema.shape },
    wrap(baUpdateArtifact));
  server.registerTool("ba_link",
    { description: "Link two artifacts via implements/satisfies/refines.", inputSchema: baLinkSchema.shape },
    wrap(baLink));
  server.registerTool("ba_get",
    { description: "Get one artifact by id.", inputSchema: baGetSchema.shape },
    wrap(baGet));
  server.registerTool("ba_list",
    { description: "List artifacts filtered by type/status/priority/tag.", inputSchema: baListSchema.shape },
    wrap(baList));
  return server;
}

async function main() {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}

// Run as binary when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
