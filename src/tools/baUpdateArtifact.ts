import { rmSync } from "node:fs";
import { z } from "zod";
import { resolveConfig } from "../config.js";
import { listArtifacts, writeArtifact } from "../core/store.js";
import { appendChangelog } from "../core/changelog.js";

export const baUpdateSchema = z.object({
  projectRoot: z.string(),
  id: z.string(),
  title: z.string().optional(),
  status: z.enum(["draft", "reviewed", "approved", "implemented", "obsolete"]).optional(),
  priority: z.enum(["must", "should", "could", "wont"]).optional(),
  body: z.string().optional(),
  updated: z.string().optional(),
});

export function baUpdateArtifact(input: z.infer<typeof baUpdateSchema>): { id: string; filePath: string; version: number } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const existing = listArtifacts(docsRoot).find(a => a.frontmatter.id === input.id);
  if (!existing) throw new Error(`Artifact not found: ${input.id}`);

  const fm = { ...existing.frontmatter };
  const changed: string[] = [];
  if (input.title !== undefined && input.title !== fm.title) { fm.title = input.title; changed.push("title"); }
  if (input.status !== undefined && input.status !== fm.status) { fm.status = input.status; changed.push("status"); }
  if (input.priority !== undefined && input.priority !== fm.priority) { fm.priority = input.priority; changed.push("priority"); }
  const body = input.body !== undefined ? input.body : existing.body;
  if (input.body !== undefined) changed.push("body");

  fm.version = (fm.version ?? 1) + 1;
  fm.updated = input.updated ?? new Date().toISOString().slice(0, 10);

  const filePath = writeArtifact({ frontmatter: fm, body }, docsRoot);
  // A title change moves the slug-keyed path; remove the orphaned old file so one id == one file.
  if (filePath !== existing.filePath) rmSync(existing.filePath, { force: true });
  appendChangelog(docsRoot, `${fm.updated} ${fm.id} v${fm.version}: changed ${changed.join(", ") || "metadata"}`);
  return { id: fm.id, filePath, version: fm.version };
}
