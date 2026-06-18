import { z } from "zod";
import { resolveConfig } from "../config.js";
import { listArtifacts } from "../core/store.js";
import { detectGaps } from "../core/gaps.js";
import { readSession } from "../core/session.js";

export const baStatusSchema = z.object({ projectRoot: z.string() });

export function baStatus(input: z.infer<typeof baStatusSchema>):
  { mode: string | null; openQuestions: number; gaps: number; pendingApply: number; counts: Record<string, number>; stable: boolean } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const session = readSession(docsRoot);
  const all = listArtifacts(docsRoot);
  const artifacts = all.filter(a => a.frontmatter.type !== "decision");
  const gaps = detectGaps(artifacts);

  const counts: Record<string, number> = {};
  for (const a of artifacts) counts[a.frontmatter.type] = (counts[a.frontmatter.type] ?? 0) + 1;

  const openQuestions = session?.open_questions.length ?? 0;
  return {
    mode: session?.mode ?? null,
    openQuestions,
    gaps: gaps.length,
    pendingApply: session?.pending_apply.length ?? 0,
    counts,
    stable: openQuestions === 0 && gaps.length === 0,
  };
}
