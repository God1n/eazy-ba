import { existsSync, readFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { parse } from "yaml";

export interface BaConfig {
  docsRoot: string;
  idStart: number;
}

export function resolveConfig(projectRoot: string): BaConfig {
  const defaultRoot = join(projectRoot, "docs/ba");
  const configPath = join(defaultRoot, "_config.yml");
  let docsRoot = defaultRoot;
  let idStart = 1;

  if (existsSync(configPath)) {
    const raw = parse(readFileSync(configPath, "utf8")) ?? {};
    if (typeof raw.docsRoot === "string") {
      docsRoot = isAbsolute(raw.docsRoot) ? raw.docsRoot : join(projectRoot, raw.docsRoot);
    }
    if (typeof raw.idStart === "number") idStart = raw.idStart;
  }
  return { docsRoot, idStart };
}
