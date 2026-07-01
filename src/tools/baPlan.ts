import { z } from "zod";
import { resolveConfig } from "../config.js";
import {
  createOrUpsertOpenItem, transitionOpenItem, listOpenItems,
} from "../core/openItems.js";
import { isFloorTopic, isPlanTopic } from "../core/taxonomy.js";
import type { PlanTopic } from "../core/assessment.js";

// ba_plan — the host agent (or, via the same call, the user) declares, extends,
// or retires a VISIBLE coverage plan on top of the floor (Flow 1 R2/R3/R4/R11).
//
// A declared topic becomes a `coverage-topic` open-item (createOrUpsertOpenItem,
// idempotent by topic — re-declaring is a no-op). A retired topic transitions to
// the terminal `retired` state and stops gating stability. Plan topics are plain
// strings, deliberately disjoint from the floor's `floor:*` namespace; the server
// records an agent-supplied and a user-supplied topic identically (no source field).
//
// Convergence (R3): there is NO blocking gate. Topics may be declared while the
// deep round is open; a topic declared after answering has begun simply seeds the
// next round as a fresh `open` coverage-topic. Termination is guaranteed by the
// floor-only off-ramp (Unit 7) — the plan is optional depth, never a hard block.

const PlanOperation = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("declare"),
    topic: z.string().min(1),
    // Optional human-readable prompt carried as the open-item title so it
    // round-trips as a research-round question (see coverageQuestions).
    prompt: z.string().optional(),
  }),
  z.object({
    op: z.literal("retire"),
    topic: z.string().min(1),
  }),
]);

export const baPlanSchema = z.object({
  projectRoot: z.string(),
  operations: z.array(PlanOperation).min(1),
});

export interface BaPlanResult {
  declared: string[];
  retired: string[];
  /**
   * Fix 15: retire targets that WERE found as plan coverage-topics but are already
   * in a non-open (terminal) state — nothing to retire, but the caller should know
   * the topic exists and is already closed (distinct from a topic that never existed).
   */
  alreadyClosed: string[];
  /** The current OPEN plan set (agent/user coverage topics, excluding floor:*). */
  plan: PlanTopic[];
}

export function baPlan(input: z.infer<typeof baPlanSchema>): BaPlanResult {
  const { docsRoot } = resolveConfig(input.projectRoot);

  const declared: string[] = [];
  const retired: string[] = [];
  const alreadyClosed: string[] = [];

  for (const op of input.operations) {
    if (op.op === "declare") {
      if (isFloorTopic(op.topic)) {
        throw new Error(`Plan topics must not use the reserved floor:* namespace: "${op.topic}"`);
      }
      // Idempotent: if a coverage-topic with this topic already exists, no new
      // item is created and we do not report it as a fresh declaration.
      const before = listOpenItems(docsRoot).some(
        i => i.kind === "coverage-topic" && i.topic === op.topic,
      );
      createOrUpsertOpenItem(
        { kind: "coverage-topic", title: op.prompt ?? op.topic, topic: op.topic },
        docsRoot,
      );
      if (!before) declared.push(op.topic);
    } else {
      // retire: transition the matching OPEN plan coverage-topic to terminal.
      const item = listOpenItems(docsRoot).find(
        i => i.kind === "coverage-topic" && i.topic === op.topic && isPlanTopic(i.topic),
      );
      if (item && item.item_state === "open") {
        transitionOpenItem(item.id as string, "retired", docsRoot);
        retired.push(op.topic);
      } else if (item) {
        // Fix 15: the topic exists as a plan coverage-topic but is already in a
        // non-open (terminal) state — signal it rather than silently no-op'ing,
        // so the caller can distinguish "already closed" from "never existed".
        alreadyClosed.push(op.topic);
      }
    }
  }

  const plan = currentPlan(docsRoot);
  return { declared, retired, alreadyClosed, plan };
}

// The current OPEN plan set (used for the tool result and for visibility surfaces).
export function currentPlan(docsRoot: string): PlanTopic[] {
  return listOpenItems(docsRoot)
    .filter(i => i.kind === "coverage-topic" && isPlanTopic(i.topic) && i.item_state === "open")
    .map(i => ({ topic: i.topic as string, item_state: i.item_state as string }));
}
