import { z } from "zod";
import { resolveConfig } from "../config.js";
import { listArtifacts } from "../core/store.js";
import { readSession } from "../core/session.js";
import { listOpenItems } from "../core/openItems.js";
import { computeAssessment, type PlanTopic } from "../core/assessment.js";

export const baStatusSchema = z.object({ projectRoot: z.string() });

const OFF_RAMP_MESSAGE =
  "Essentials covered — the built-in floor is complete. You can finalize now " +
  "(ba_finalize promotes your drafts to reviewed) or keep going for more depth.";

// Soft off-ramp (Flow 1 R12): derived deterministically (read-only) from open-item
// state. The floor must have been SEEDED (≥1 floor:* coverage-topic exists) and
// NONE may still be `open`. Requiring the floor to exist prevents a vacuous off-ramp
// before the deep round (an empty project has no floor:* items, so "no open floor
// item" would otherwise be trivially true). Plan topics and observations do not gate
// the off-ramp — only the floor — matching "essentials covered".
function floorCovered(docsRoot: string): boolean {
  const floor = listOpenItems(docsRoot).filter(
    oi => oi.kind === "coverage-topic" && typeof oi.topic === "string" && (oi.topic as string).startsWith("floor:"),
  );
  if (floor.length === 0) return false; // floor not yet seeded → no off-ramp
  return floor.every(oi => oi.item_state !== "open");
}

export function baStatus(input: z.infer<typeof baStatusSchema>):
  { mode: string | null; openQuestions: number; gaps: number; pendingApply: number; counts: Record<string, number>; stable: boolean; openPlanTopics: number; coveragePlan: PlanTopic[]; offRamp?: string } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const session = readSession(docsRoot);
  // Fix 12: the user-facing counts show real BA documents only. Exclude internal
  // store artifacts — `decision` (the ledger) and `open-item` (coverage/observation
  // gates) — which are implementation detail, not deliverables.
  const artifacts = listArtifacts(docsRoot).filter(
    a => a.frontmatter.type !== "decision" && a.frontmatter.type !== "open-item",
  );
  const counts: Record<string, number> = {};
  for (const a of artifacts) counts[a.frontmatter.type] = (counts[a.frontmatter.type] ?? 0) + 1;
  const a = computeAssessment(docsRoot, session?.mode ?? "discovery");
  const coveragePlan = a.coveragePlan ?? [];
  const offRamp = floorCovered(docsRoot) ? OFF_RAMP_MESSAGE : undefined;
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
    // Soft off-ramp (R12): only present once the floor is fully covered.
    ...(offRamp ? { offRamp } : {}),
  };
}
