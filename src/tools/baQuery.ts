import { z } from "zod";
import { resolveConfig } from "../config.js";
import { listArtifacts } from "../core/store.js";
import type { Artifact } from "../core/types.js";

export const baGetSchema = z.object({ projectRoot: z.string(), id: z.string() });

export function baGet(input: z.infer<typeof baGetSchema>): Artifact {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const art = listArtifacts(docsRoot).find(a => a.frontmatter.id === input.id);
  if (!art) throw new Error(`Artifact not found: ${input.id}`);
  return art;
}

export const baListSchema = z.object({
  projectRoot: z.string(),
  type: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  tag: z.string().optional(),
});

export function baList(input: z.infer<typeof baListSchema>):
  Array<{ id: string; type: string; title: string; status: string; priority?: string }> {
  const { docsRoot } = resolveConfig(input.projectRoot);
  return listArtifacts(docsRoot)
    .filter(a => !input.type || a.frontmatter.type === input.type)
    .filter(a => !input.status || a.frontmatter.status === input.status)
    .filter(a => !input.priority || a.frontmatter.priority === input.priority)
    .filter(a => !input.tag || (a.frontmatter.tags ?? []).includes(input.tag))
    .map(a => ({
      id: a.frontmatter.id,
      type: a.frontmatter.type,
      title: a.frontmatter.title,
      status: a.frontmatter.status,
      ...(a.frontmatter.priority ? { priority: a.frontmatter.priority } : {}),
    }));
}
