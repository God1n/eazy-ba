import { existsSync, readFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { parse } from "yaml";

export interface BaConfig {
  docsRoot: string;
  idStart: number;
}

// Unit 9 docsRoot decision: resolveConfig intentionally STILL honors an absolute
// docsRoot in _config.yml (a documented feature — see tests/config.test.ts), so a
// realpath-within-projectRoot containment check is deliberately NOT added here. It
// would hard-break the documented absolute-docsRoot use case for no real security
// gain: the load-bearing read boundary is the CODE-READ scope (anchors), enforced
// at the core layer by scopeGuard (realpath scope + deny-list). docsRoot only
// controls where the server writes its OWN doc store; _config.yml itself is written
// by the server's tools (trust perimeter). Redirecting docsRoot at worst points the
// doc store elsewhere — it does not widen what code the agent may anchor or what the
// server will auto-accept. So the threat the plan flagged (a _config.yml override
// pointing docsRoot at ~/.ssh) does not let the server READ ~/.ssh — resolveConfig
// never reads code; ba_ground's scopeGuard is the only path that touches source, and
// it is bounded by read_scope + the deny-list regardless of docsRoot. We therefore
// leave resolveConfig unchanged and rely on scopeGuard for the actual boundary.
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
