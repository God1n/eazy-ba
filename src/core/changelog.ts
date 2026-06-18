import { appendFileSync } from "node:fs";
import { join } from "node:path";

export function appendChangelog(docsRoot: string, line: string): void {
  appendFileSync(join(docsRoot, "07-changelog/CHANGELOG.md"), `- ${line}\n`, "utf8");
}
