import { beforeAll, expect, test } from "vitest";
import { execSync } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const distEntry = resolve(__dirname, "../dist/index.js");

beforeAll(() => {
  // The launch test exercises the built binary, so ensure dist/ is current.
  execSync("npm run build", { cwd: resolve(__dirname, ".."), stdio: "ignore" });
}, 60_000);

// Sends an MCP initialize request to the spawned process and resolves with
// the accumulated stdout (or "" if nothing came back before the timeout).
function probe(target: string): Promise<string> {
  return new Promise((resolveProbe) => {
    const child = spawn("node", [target], { stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    const req = {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } },
    };
    child.stdin.write(JSON.stringify(req) + "\n");
    setTimeout(() => { child.kill(); resolveProbe(out); }, 2000);
  });
}

test("starts the MCP server when launched through a symlinked bin (npx / claude mcp add)", async () => {
  // Reproduce how npx and `claude mcp add` invoke the package: via a symlink
  // whose path differs from the resolved module path.
  const dir = mkdtempSync(join(tmpdir(), "eazy-ba-bin-"));
  const link = join(dir, "eazy-ba");
  symlinkSync(distEntry, link);

  const out = await probe(link);
  expect(out).toContain("serverInfo");
  expect(out).toContain("eazy-ba");
}, 15_000);
