import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { baApply } from "../../src/tools/baApply.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { baStatus } from "../../src/tools/baStatus.js";
import { baFinalize } from "../../src/tools/baFinalize.js";
import { listArtifacts } from "../../src/core/store.js";
import { createOrUpsertOpenItem, listOpenItems, transitionOpenItem } from "../../src/core/openItems.js";

// Seed a discovery session with one recorded (deliberate) decision so ba_apply
// can create normative drafts backed by it.
function seedSession(root: string): { docsRoot: string; decId: string } {
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  const rec = baRecordAnswers({ projectRoot: root, items: [
    { question: "What story?", answer: "User resets password", asked_round: "surface", topic: "auth" },
  ] });
  return { docsRoot: join(root, "docs/ba"), decId: rec.recorded[0] };
}

function statusOf(docsRoot: string, id: string): string | undefined {
  return listArtifacts(docsRoot).find(a => a.frontmatter.id === id)?.frontmatter.status as string | undefined;
}

// ---------------------------------------------------------------------------
// Happy: with draft artifacts present, ba_finalize promotes them all to
// "reviewed" and returns the set.
// ---------------------------------------------------------------------------
test("promotes every draft BA doc to reviewed and returns the set", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const { docsRoot, decId } = seedSession(root);
  const a = baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Reset password", body: "Given a When b Then c", derived_from: [decId] },
    { op: "create", type: "persona", title: "End user", body: "Someone who logs in", derived_from: [decId] },
  ] });
  const ids = a.applied.map(x => x.id);
  // ba_apply creates as draft (R9 incremental).
  for (const id of ids) expect(statusOf(docsRoot, id)).toBe("draft");

  const res = baFinalize({ projectRoot: root });
  expect(res.promoted.map(p => p.id).sort()).toEqual([...ids].sort());
  for (const p of res.promoted) expect(p.status).toBe("reviewed");
  for (const id of ids) expect(statusOf(docsRoot, id)).toBe("reviewed");
});

// ---------------------------------------------------------------------------
// Edge (idempotent): a second ba_finalize call promotes nothing (no-op) and
// does not error.
// ---------------------------------------------------------------------------
test("second finalize is a no-op (nothing in draft to promote)", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const { decId } = seedSession(root);
  baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Reset password", body: "Given a When b Then c", derived_from: [decId] },
  ] });
  const first = baFinalize({ projectRoot: root });
  expect(first.promoted).toHaveLength(1);

  const second = baFinalize({ projectRoot: root });
  expect(second.promoted).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Edge (repeatable): after a NEW draft is created post-finalize (the Phase B
// change loop re-opens work), the next ba_finalize promotes it.
// ---------------------------------------------------------------------------
test("re-runs after a change loop re-opens a draft", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const { docsRoot, decId } = seedSession(root);
  baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Reset password", body: "Given a When b Then c", derived_from: [decId] },
  ] });
  baFinalize({ projectRoot: root });

  // A later round records another decision and applies a new draft.
  const rec2 = baRecordAnswers({ projectRoot: root, items: [
    { question: "What else?", answer: "User changes email", asked_round: "domain", topic: "email" },
  ] });
  const a2 = baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Change email", body: "Given a When b Then c", derived_from: [rec2.recorded[0]] },
  ] });
  const newId = a2.applied[0].id;
  expect(statusOf(docsRoot, newId)).toBe("draft");

  const res = baFinalize({ projectRoot: root });
  expect(res.promoted.map(p => p.id)).toEqual([newId]);
  expect(statusOf(docsRoot, newId)).toBe("reviewed");
});

// ---------------------------------------------------------------------------
// Edge: ba_finalize ignores decision and open-item artifacts — only the real
// BA docs are promoted.
// ---------------------------------------------------------------------------
test("ignores decision and open-item artifacts (only real BA docs promoted)", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const { docsRoot, decId } = seedSession(root); // already created a decision (draft)
  // A draft open-item also exists in the store.
  createOrUpsertOpenItem({ kind: "coverage-topic", title: "plan topic", topic: "extra-topic" }, docsRoot);
  const a = baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Reset password", body: "Given a When b Then c", derived_from: [decId] },
  ] });
  const storyId = a.applied[0].id;

  const res = baFinalize({ projectRoot: root });
  // Only the story was promoted; no decision (DEC-*) or open-item (OPI-*) id.
  expect(res.promoted.map(p => p.id)).toEqual([storyId]);
  expect(res.promoted.some(p => p.id.startsWith("DEC"))).toBe(false);
  expect(res.promoted.some(p => p.id.startsWith("OPI"))).toBe(false);

  // Neither the decision nor the open-item was touched by finalize (finalize
  // only promotes real BA docs to "reviewed", so neither is now "reviewed").
  expect(statusOf(docsRoot, decId)).not.toBe("reviewed");
  const opi = listOpenItems(docsRoot)[0];
  expect(opi.status).not.toBe("reviewed");
  expect(opi.status).toBe("draft");
});

// ---------------------------------------------------------------------------
// Off-ramp: ba_status surfaces the off-ramp ONLY after every floor:* topic is
// answered/retired — not before.
// ---------------------------------------------------------------------------
test("off-ramp appears only after the floor is fully answered", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const { docsRoot } = seedSession(root);

  // Before the floor is seeded (surface still) — no off-ramp.
  expect(baStatus({ projectRoot: root }).offRamp).toBeUndefined();

  // Seed the floor (deep round entry): floor topics now open → still no off-ramp.
  baAssess({ projectRoot: root });
  const seeded = baStatus({ projectRoot: root });
  expect(seeded.offRamp).toBeUndefined();
  expect(
    listOpenItems(docsRoot).some(
      oi => oi.kind === "coverage-topic" && (oi.topic as string).startsWith("floor:") && oi.item_state === "open",
    ),
  ).toBe(true);

  // Answer every open floor topic.
  for (const oi of listOpenItems(docsRoot)) {
    if (oi.kind === "coverage-topic" && (oi.topic as string).startsWith("floor:") && oi.item_state === "open") {
      transitionOpenItem(oi.id as string, "answered", docsRoot);
    }
  }

  const covered = baStatus({ projectRoot: root });
  expect(covered.offRamp).toBeTruthy();
  expect(String(covered.offRamp)).toMatch(/finalize/i);
});
