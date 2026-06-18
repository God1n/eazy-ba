import type { ArtifactType } from "./types.js";
import { ID_PREFIX } from "./types.js";
import { listArtifacts } from "./store.js";

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
