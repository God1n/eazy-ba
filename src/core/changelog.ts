import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export function appendChangelog(docsRoot: string, line: string): void {
  const p = join(docsRoot, "07-changelog/CHANGELOG.md");
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, `- ${line}\n`, "utf8");
}
