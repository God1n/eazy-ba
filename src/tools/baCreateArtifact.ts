import { z } from "zod";
import { resolveConfig } from "../config.js";
import { nextId } from "../core/ids.js";
import { writeArtifact } from "../core/store.js";
import { bodyTemplate } from "../core/templates.js";
import type { ArtifactType, Frontmatter } from "../core/types.js";

export const baCreateSchema = z.object({
  projectRoot: z.string(),
  type: z.enum(["persona", "fr", "nfr", "use-case", "story"]),
  title: z.string().min(1),
  priority: z.enum(["must", "should", "could", "wont"]).optional(),
  implements: z.array(z.string()).optional(),
  satisfies: z.array(z.string()).optional(),
  refines: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  body: z.string().optional(),
  updated: z.string().optional(),
});

export function baCreateArtifact(input: z.infer<typeof baCreateSchema>): { id: string; filePath: string } {
  const { docsRoot, idStart } = resolveConfig(input.projectRoot);
  const type = input.type as ArtifactType;
  const id = nextId(type, docsRoot, idStart);
  const frontmatter: Frontmatter = {
    id, type, title: input.title, status: "draft", version: 1,
    updated: input.updated ?? new Date().toISOString().slice(0, 10),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.implements ? { implements: input.implements } : {}),
    ...(input.satisfies ? { satisfies: input.satisfies } : {}),
    ...(input.refines ? { refines: input.refines } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
  };
  const body = input.body ?? bodyTemplate(type);
  const filePath = writeArtifact({ frontmatter, body }, docsRoot);
  return { id, filePath };
}
