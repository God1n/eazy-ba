import { z } from "zod";
import { resolveConfig } from "../config.js";
import { listArtifacts, writeArtifact } from "../core/store.js";
import { buildGraph } from "../core/graph.js";
import { appendChangelog } from "../core/changelog.js";

export const baLinkSchema = z.object({
  projectRoot: z.string(),
  from: z.string(),
  to: z.string(),
  kind: z.enum(["implements", "satisfies", "refines"]),
});

export function baLink(input: z.infer<typeof baLinkSchema>): { from: string; to: string; kind: string; warning?: string } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const all = listArtifacts(docsRoot);
  const from = all.find(a => a.frontmatter.id === input.from);
  if (!from) throw new Error(`Artifact not found: ${input.from}`);

  const fm = { ...from.frontmatter };
  const list = new Set([...((fm[input.kind] as string[] | undefined) ?? []), input.to]);
  fm[input.kind] = [...list];
  fm.version = (fm.version ?? 1) + 1;
  fm.updated = new Date().toISOString().slice(0, 10);
  writeArtifact({ frontmatter: fm, body: from.body }, docsRoot);
  appendChangelog(docsRoot, `${fm.updated} ${fm.id}: ${input.kind} ${input.to}`);

  const warning = buildGraph(all).ids.has(input.to) ? undefined
    : `Target ${input.to} is not a known artifact id (dangling link).`;
  return { from: input.from, to: input.to, kind: input.kind, warning };
}
