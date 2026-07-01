import type { ArtifactType } from "./types.js";
import { ID_PREFIX } from "./types.js";
import { listArtifacts } from "./store.js";

// Today's date as an ISO `YYYY-MM-DD` string. The single source of the `updated`
// stamp shared across decisions/openItems and the tool write paths.
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nextId(type: ArtifactType, docsRoot: string, idStart = 1): string {
  const prefix = ID_PREFIX[type];
  let max = idStart - 1;
  for (const art of listArtifacts(docsRoot)) {
    if (art.frontmatter.type !== type) continue;
    const m = /-(\d+)$/.exec(art.frontmatter.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}
