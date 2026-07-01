import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { baApply } from "../../src/tools/baApply.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { listDecisions, getDecision } from "../../src/core/decisions.js";
import { createOrUpsertOpenItem, getOpenItem } from "../../src/core/openItems.js";

// A ground session with one OPEN inferred observation on disk, ready to confirm.
// We seed the observation directly (createOrUpsertOpenItem) rather than via the
// code-reading ba_ground path, so the confirmation behaviour is tested in isolation.
function setupInferred(): { root: string; docsRoot: string; obsId: string } {
  const root = mkdtempSync(join(tmpdir(), "ba-confirm-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "ground", readScope: ["src/**"] });
  const docsRoot = join(root, "docs/ba");
  const obsId = createOrUpsertOpenItem(
    {
      kind: "observation",
      title: "GET /users route exists",
      claim: "GET /users route exists",
      anchors: ["src/routes.ts"],
      fact_kind: "inferred",
      item_state: "open",
    },
    docsRoot,
  );
  return { root, docsRoot, obsId };
}

// The confirm-question the engine emits for an OPEN inferred observation keys
// topic === the observation's open-item id. baRecordAnswers matches on that.
function confirmItem(obsId: string, answer: string, extra: Record<string, unknown> = {}) {
  return {
    question: "Confirm or correct this inferred observation: GET /users route exists",
    answer,
    asked_round: "confirm" as const,
    topic: obsId,
    ...extra,
  };
}

// ── LOAD-BEARING: the passive-assent guard actually bites ─────────────────────
// A BULK-confirmed inference is recorded `confirmed-as-inferred`, which does NOT
// satisfy the Unit 4 normative gate — so an `fr` derived from it is REJECTED.
test("bulk-confirm yields confirmed-as-inferred and CANNOT back a normative fr", () => {
  const { root, docsRoot, obsId } = setupInferred();

  const res = baRecordAnswers({
    projectRoot: root,
    bulk: true,
    items: [confirmItem(obsId, "GET /users route exists")],
  });
  expect(res.recorded).toHaveLength(1);
  const decId = res.recorded[0];
  expect(getDecision(decId, docsRoot)!.provenance).toBe("confirmed-as-inferred");
  // The observation is now confirmed (resolved out of "open").
  expect(getOpenItem(obsId, docsRoot)!.item_state).toBe("confirmed");

  // The guard bites: an fr backed ONLY by the confirmed-as-inferred decision is rejected.
  expect(() =>
    baApply({
      projectRoot: root,
      artifacts: [
        { op: "create", type: "fr", title: "List users", body: "List users endpoint", derived_from: [decId] },
      ],
    }),
  ).toThrow(/deliberate/i);
});

// ── Happy: deliberate single confirm → user-decided → fr APPLIES ──────────────
test("deliberate confirm yields user-decided and CAN back a normative fr", () => {
  const { root, docsRoot, obsId } = setupInferred();

  const res = baRecordAnswers({
    projectRoot: root,
    items: [confirmItem(obsId, "GET /users route exists")],
  });
  const decId = res.recorded[0];
  expect(getDecision(decId, docsRoot)!.provenance).toBe("user-decided");
  expect(getOpenItem(obsId, docsRoot)!.item_state).toBe("confirmed");

  const applied = baApply({
    projectRoot: root,
    artifacts: [
      { op: "create", type: "fr", title: "List users", body: "List users endpoint", derived_from: [decId] },
    ],
  });
  expect(applied.applied[0].op).toBe("create");
});

// ── Happy: correct an inference → corrected (verbatim) → supersede → fr applies ─
test("correcting an inference records corrected text verbatim and marks the observation corrected", () => {
  const { root, docsRoot, obsId } = setupInferred();

  const corrected = "GET /users route exists but is admin-only";
  const res = baRecordAnswers({
    projectRoot: root,
    items: [confirmItem(obsId, corrected)],
  });
  const decId = res.recorded[0];
  const dec = getDecision(decId, docsRoot)!;
  expect(dec.provenance).toBe("corrected");
  expect(dec.answer).toBe(corrected); // recorded verbatim
  expect(getOpenItem(obsId, docsRoot)!.item_state).toBe("corrected");

  // An fr derived from the corrected decision applies (corrected satisfies the gate).
  const applied = baApply({
    projectRoot: root,
    artifacts: [
      { op: "create", type: "fr", title: "List users (admin)", body: "List users", derived_from: [decId] },
    ],
  });
  expect(applied.applied[0].op).toBe("create");
});

// ── Correct twice → the prior confirm decision is superseded (append-only) ─────
test("re-correcting supersedes the prior confirm decision (supersede does not throw)", () => {
  const { root, docsRoot, obsId } = setupInferred();

  const first = baRecordAnswers({
    projectRoot: root,
    items: [confirmItem(obsId, "GET /users route exists")],
  });
  const firstDec = first.recorded[0];
  expect(getDecision(firstDec, docsRoot)!.status).toBe("approved");

  const second = baRecordAnswers({
    projectRoot: root,
    items: [confirmItem(obsId, "GET /users route exists for admins only")],
  });
  const secondDec = second.recorded[0];
  expect(secondDec).not.toBe(firstDec);
  // The first decision is now obsolete, superseded by the correction.
  expect(getDecision(firstDec, docsRoot)!.status).toBe("obsolete");
  expect(getDecision(firstDec, docsRoot)!.superseded_by).toBe(secondDec);
  expect(getDecision(secondDec, docsRoot)!.provenance).toBe("corrected");
});

// ── Reject → observation rejected, no backing decision, not resurrected ───────
test("rejecting an inference records no decision and marks the observation rejected", () => {
  const { root, docsRoot, obsId } = setupInferred();

  const res = baRecordAnswers({
    projectRoot: root,
    items: [confirmItem(obsId, "n/a", { resolution: "reject" })],
  });
  expect(res.recorded).toHaveLength(0);
  expect(listDecisions(docsRoot)).toHaveLength(0); // nothing backed by it
  expect(getOpenItem(obsId, docsRoot)!.item_state).toBe("rejected");

  // Not resurrected on a re-run with the same evidence (createOrUpsert keeps terminal state).
  createOrUpsertOpenItem(
    {
      kind: "observation",
      title: "GET /users route exists",
      claim: "GET /users route exists",
      anchors: ["src/routes.ts"],
      fact_kind: "inferred",
      item_state: "open",
    },
    docsRoot,
  );
  expect(getOpenItem(obsId, docsRoot)!.item_state).toBe("rejected");
});

// ── Resolving transitions the observation out of "open" so it stops gating ────
test("confirming an observation stops it surfacing as a confirm-question (stops gating)", () => {
  const { root, obsId } = setupInferred();

  // Before: the open inferred observation surfaces as a confirm-round question.
  const before = baAssess({ projectRoot: root });
  expect(before.questions.some(q => q.round === "confirm" && q.topic === obsId)).toBe(true);
  expect(before.stable).toBe(false);

  baRecordAnswers({ projectRoot: root, items: [confirmItem(obsId, "GET /users route exists")] });

  // After: no confirm-question for it; computeAssessment no longer emits it.
  const after = baAssess({ projectRoot: root });
  expect(after.questions.some(q => q.round === "confirm" && q.topic === obsId)).toBe(false);
});

// ── Rejecting also stops it gating stability ──────────────────────────────────
test("rejecting an observation stops it gating stability", () => {
  const { root, obsId } = setupInferred();
  baRecordAnswers({ projectRoot: root, items: [confirmItem(obsId, "n/a", { resolution: "reject" })] });
  const after = baAssess({ projectRoot: root });
  expect(after.questions.some(q => q.round === "confirm" && q.topic === obsId)).toBe(false);
  expect(after.stable).toBe(true); // ground session, no other gates
});
