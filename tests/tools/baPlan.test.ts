import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { baPlan } from "../../src/tools/baPlan.js";
import { baStatus } from "../../src/tools/baStatus.js";
import { recordDecision } from "../../src/core/decisions.js";
import { listOpenItems, transitionOpenItem } from "../../src/core/openItems.js";

function setupDeepRound(): { root: string; docsRoot: string } {
  const root = mkdtempSync(join(tmpdir(), "ba-plan-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  const docsRoot = join(root, "docs/ba");
  // A surface answer marks deep-round entry (discovery, decisions exist).
  recordDecision(
    { question: "Scope?", answer: "MVP", asked_round: "surface", topic: "scope", updated: "2026-06-30" },
    docsRoot,
  );
  return { root, docsRoot };
}

// Coverage-topic open-items whose topic is NOT a floor:* dimension are the
// agent/user plan.
function planTopics(docsRoot: string, openOnly = true): string[] {
  return listOpenItems(docsRoot)
    .filter(i =>
      i.kind === "coverage-topic" &&
      typeof i.topic === "string" &&
      !(i.topic as string).startsWith("floor:") &&
      (!openOnly || i.item_state === "open"),
    )
    .map(i => i.topic as string);
}

// ---------------------------------------------------------------------------
// Happy: declare 3 topics → 3 open coverage-items; ba_assess lists them as
// questions; they gate stability.
// ---------------------------------------------------------------------------
test("declare 3 topics creates 3 open coverage-items that ba_assess lists and which gate stability", () => {
  const { root, docsRoot } = setupDeepRound();
  const res = baPlan({
    projectRoot: root,
    operations: [
      { op: "declare", topic: "payments-flow", prompt: "How are payments authorized and captured?" },
      { op: "declare", topic: "auth-model" },
      { op: "declare", topic: "audit-logging" },
    ],
  });

  expect(res.declared.sort()).toEqual(["audit-logging", "auth-model", "payments-flow"]);
  // The returned plan set reflects the three open topics.
  expect(res.plan.map(p => p.topic).sort()).toEqual(["audit-logging", "auth-model", "payments-flow"]);
  expect(res.plan.every(p => p.item_state === "open")).toBe(true);

  // Three open coverage-items on disk (non-floor).
  expect(planTopics(docsRoot).sort()).toEqual(["audit-logging", "auth-model", "payments-flow"]);

  // ba_assess surfaces them as research-round questions and is not stable.
  const a = baAssess({ projectRoot: root });
  const planQs = a.questions.filter(q => ["payments-flow", "auth-model", "audit-logging"].includes(q.topic));
  expect(planQs.length).toBe(3);
  expect(a.stable).toBe(false);
});

// ---------------------------------------------------------------------------
// Edge: re-declare an existing topic → idempotent (no duplicate).
// ---------------------------------------------------------------------------
test("re-declaring an existing topic is idempotent (no duplicate)", () => {
  const { root, docsRoot } = setupDeepRound();
  baPlan({ projectRoot: root, operations: [{ op: "declare", topic: "payments-flow" }] });
  const res = baPlan({
    projectRoot: root,
    operations: [{ op: "declare", topic: "payments-flow", prompt: "different prompt" }],
  });
  // Re-declare reports no NEW declaration.
  expect(res.declared).toEqual([]);
  // Still exactly one plan item for the topic.
  expect(planTopics(docsRoot)).toEqual(["payments-flow"]);
  expect(listOpenItems(docsRoot).filter(i => i.topic === "payments-flow").length).toBe(1);
});

// ---------------------------------------------------------------------------
// Edge: retire a topic → removed from open set (item_state retired); answering
// the floor + retiring all plan topics → stable=true.
// ---------------------------------------------------------------------------
test("retiring a topic removes it from the open set; retiring all plan topics + answering floor reaches stable", () => {
  const { root, docsRoot } = setupDeepRound();
  baPlan({
    projectRoot: root,
    operations: [
      { op: "declare", topic: "payments-flow" },
      { op: "declare", topic: "auth-model" },
    ],
  });
  // Seed the floor.
  baAssess({ projectRoot: root });

  // Retire one plan topic.
  const retired = baPlan({ projectRoot: root, operations: [{ op: "retire", topic: "payments-flow" }] });
  expect(retired.retired).toEqual(["payments-flow"]);
  expect(planTopics(docsRoot)).toEqual(["auth-model"]);
  // The retired item is in terminal state "retired".
  const retiredItem = listOpenItems(docsRoot).find(i => i.topic === "payments-flow");
  expect(retiredItem?.item_state).toBe("retired");

  // Retire the remaining plan topic, answer every open floor topic.
  baPlan({ projectRoot: root, operations: [{ op: "retire", topic: "auth-model" }] });
  for (const oi of listOpenItems(docsRoot)) {
    if (oi.kind === "coverage-topic" && (oi.topic as string).startsWith("floor:") && oi.item_state === "open") {
      transitionOpenItem(oi.id as string, "answered", docsRoot);
    }
  }

  const a = baAssess({ projectRoot: root });
  expect(a.questions.length).toBe(0);
  expect(a.stable).toBe(true);
});

// ---------------------------------------------------------------------------
// Edge: a user-added topic (same ba_plan declare) is recorded identically to an
// agent-added one — the server records either source the same way.
// ---------------------------------------------------------------------------
test("a user-added topic is recorded identically to an agent-added one", () => {
  const { root, docsRoot } = setupDeepRound();
  baPlan({ projectRoot: root, operations: [{ op: "declare", topic: "agent-topic" }] });
  baPlan({ projectRoot: root, operations: [{ op: "declare", topic: "user-topic" }] });

  const items = listOpenItems(docsRoot).filter(i =>
    i.topic === "agent-topic" || i.topic === "user-topic");
  expect(items.length).toBe(2);
  // Same kind, same item_state, same shape — no source-discriminating field.
  const [a, b] = items;
  expect(a.kind).toBe(b.kind);
  expect(a.item_state).toBe(b.item_state);
  expect(a.kind).toBe("coverage-topic");
  // Neither carries a distinguishing "source" attribute.
  expect((a as Record<string, unknown>).source).toBeUndefined();
  expect((b as Record<string, unknown>).source).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Edge: declaring a topic after answers exist still records it (seeds next
// round), doesn't throw/block. No blocking convergence gate (R3).
// ---------------------------------------------------------------------------
test("declaring a topic after answering has begun still records it (seeds next round), does not block", () => {
  const { root, docsRoot } = setupDeepRound();
  baPlan({ projectRoot: root, operations: [{ op: "declare", topic: "first-topic" }] });
  baAssess({ projectRoot: root });

  // Answer the first topic via the normal record path.
  recordDecision(
    { question: "first?", answer: "x", asked_round: "research", topic: "first-topic", updated: "2026-06-30" },
    docsRoot,
  );

  // Declaring a new topic now must not throw and must record it as open.
  let res!: ReturnType<typeof baPlan>;
  expect(() => { res = baPlan({ projectRoot: root, operations: [{ op: "declare", topic: "late-topic" }] }); }).not.toThrow();
  expect(res.declared).toEqual(["late-topic"]);
  expect(planTopics(docsRoot)).toContain("late-topic");

  // It seeds the next round: ba_assess surfaces it and is not stable.
  const a = baAssess({ projectRoot: root });
  expect(a.questions.some(q => q.topic === "late-topic")).toBe(true);
  expect(a.stable).toBe(false);
});

// ---------------------------------------------------------------------------
// Visibility (R11): the open plan set is surfaced in ba_assess and ba_status.
// ---------------------------------------------------------------------------
test("the open coverage plan is visible in ba_assess and ba_status output", () => {
  const { root } = setupDeepRound();
  baPlan({ projectRoot: root, operations: [{ op: "declare", topic: "payments-flow" }] });
  baAssess({ projectRoot: root });

  const a = baAssess({ projectRoot: root });
  expect(a.coveragePlan).toBeDefined();
  expect(a.coveragePlan!.map(p => p.topic)).toContain("payments-flow");

  // ba_status surfaces an open-plan-topic count.
  const status = baStatus({ projectRoot: root });
  expect(status.openPlanTopics).toBeGreaterThanOrEqual(1);
});
