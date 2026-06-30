import { z } from "zod";
import { resolveConfig } from "../config.js";
import { listArtifacts } from "../core/store.js";
import { readSession } from "../core/session.js";
import { computeAssessment, type PlanTopic } from "../core/assessment.js";

export const baStatusSchema = z.object({ projectRoot: z.string() });

export function baStatus(input: z.infer<typeof baStatusSchema>):
  { mode: string | null; openQuestions: number; gaps: number; pendingApply: number; counts: Record<string, number>; stable: boolean; openPlanTopics: number; coveragePlan: PlanTopic[] } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const session = readSession(docsRoot);
  const artifacts = listArtifacts(docsRoot).filter(a => a.frontmatter.type !== "decision");
  const counts: Record<string, number> = {};
  for (const a of artifacts) counts[a.frontmatter.type] = (counts[a.frontmatter.type] ?? 0) + 1;
  const a = computeAssessment(docsRoot, session?.mode ?? "discovery");
  const coveragePlan = a.coveragePlan ?? [];
  return {
    mode: session?.mode ?? null,
    openQuestions: a.questions.length,
    gaps: a.gaps.length,
    pendingApply: session?.pending_apply.length ?? 0,
    counts,
    stable: a.stable,
    // Visibility (R11): how many agent/user coverage-plan topics still gate "done".
    openPlanTopics: coveragePlan.length,
    coveragePlan,
  };
}
