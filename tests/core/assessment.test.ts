import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { computeAssessment } from "../../src/core/assessment.js";
import { createOrUpsertOpenItem, transitionOpenItem, listOpenItems } from "../../src/core/openItems.js";
import { recordDecision } from "../../src/core/decisions.js";
import { writeArtifact } from "../../src/core/store.js";
import type { Frontmatter } from "../../src/core/types.js";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "ba-assess-"));
  baInit({ projectRoot: root });
  return join(root, "docs/ba");
}

// ---------------------------------------------------------------------------
// Vacuity: the core fix. A discovery session with zero decisions but an open
// coverage-topic on disk must NOT report vacuously stable.
// ---------------------------------------------------------------------------
test("vacuity: discovery + zero decisions + an open coverage-topic → questions>0 and stable=false", () => {
  const docsRoot = setup();
  createOrUpsertOpenItem(
    { kind: "coverage-topic", title: "Scope coverage", topic: "floor:scope" },
    docsRoot,
  );
  const a = computeAssessment(docsRoot, "discovery");
  expect(a.questions.length).toBeGreaterThan(0);
  expect(a.stable).toBe(false);
  // the open coverage-topic must be represented as a question.
  expect(a.questions.some(q => q.topic === "floor:scope")).toBe(true);
});

// ---------------------------------------------------------------------------
// Happy: open coverage-topics gate, transitioning them all to terminal flips stable.
// ---------------------------------------------------------------------------
test("happy: open coverage-topics gate stability; answering/retiring all of them flips stable=true", () => {
  // Use stabilize mode so the surface round (which always carries questions in
  // discovery+zero-decisions) does not mask the coverage-topic gating.
  const docsRoot = setup();
  const a1 = createOrUpsertOpenItem({ kind: "coverage-topic", title: "Scope", topic: "floor:scope" }, docsRoot);
  const a2 = createOrUpsertOpenItem({ kind: "coverage-topic", title: "Users", topic: "floor:users" }, docsRoot);
  const initial = computeAssessment(docsRoot, "stabilize");
  expect(initial.stable).toBe(false);
  expect(initial.round).toBe("research");

  transitionOpenItem(a1, "answered", docsRoot);
  expect(computeAssessment(docsRoot, "stabilize").stable).toBe(false); // a2 still open

  transitionOpenItem(a2, "retired", docsRoot);
  const final = computeAssessment(docsRoot, "stabilize");
  expect(final.stable).toBe(true);
  expect(final.questions.length).toBe(0);
});

// ---------------------------------------------------------------------------
// Vacuity in ground mode: zero real artifacts + open observations → stable=false.
// ---------------------------------------------------------------------------
test("ground mode: zero real artifacts + an open inferred observation → stable=false (confirm question)", () => {
  const docsRoot = setup();
  createOrUpsertOpenItem(
    {
      kind: "observation",
      title: "Inferred route",
      provenance: "confirmed-as-inferred",
      fact_kind: "inferred",
      anchors: ["src/routes/users.ts#L4"],
      claim: "GET /users returns a list of users",
    },
    docsRoot,
  );
  const a = computeAssessment(docsRoot, "ground");
  expect(a.stable).toBe(false);
  const confirmQs = a.questions.filter(q => q.round === "confirm");
  expect(confirmQs.length).toBe(1);
});

// ---------------------------------------------------------------------------
// P1 SAFETY (Fix 1): a FRESH ground session (no observations, no decisions) must
// NOT be vacuously stable while it is still emitting the groundDirective. Before
// this fix it fell into the else-branch, produced zero questions, and returned
// stable:true even though groundDirective told the agent to go read code.
// ---------------------------------------------------------------------------
test("ground mode: fresh session (no observations) → stable=false and groundDirective present", () => {
  const docsRoot = setup();
  const a = computeAssessment(docsRoot, "ground");
  expect(a.groundDirective).toBeDefined();
  expect(a.stable).toBe(false); // directive is pending → never vacuously stable
});

// A ground session must not synthesize domain/change questions from BA decisions
// that happen to already exist on disk — a ground session only confirms code
// observations. Pre-existing decisions must not drive it into the else-branch.
test("ground mode: pre-existing BA decisions do NOT emit spurious domain/change questions", () => {
  const docsRoot = setup();
  // A decision on disk (as a prior discovery/change session might leave).
  recordDecision(
    { question: "What is the scope?", answer: "The users service", asked_round: "surface", topic: "floor:scope" },
    docsRoot,
  );
  const a = computeAssessment(docsRoot, "ground");
  // No observations yet → only the directive drives the session; no domain/change/gap qs.
  expect(a.questions.filter(q => q.round === "domain" || q.round === "change" || q.round === "gap").length).toBe(0);
  expect(a.groundDirective).toBeDefined();
  expect(a.stable).toBe(false);
});

// ---------------------------------------------------------------------------
// Observation gating: an open inferred observation gates; a non-open one does not.
// ---------------------------------------------------------------------------
test("an open inferred observation gates stability; a confirmed one does not", () => {
  const docsRoot = setup();
  const obs = createOrUpsertOpenItem(
    {
      kind: "observation",
      title: "Inferred middleware",
      provenance: "confirmed-as-inferred",
      fact_kind: "inferred",
      anchors: ["src/mw/auth.ts#L10"],
      claim: "auth middleware guards /admin",
    },
    docsRoot,
  );
  expect(computeAssessment(docsRoot, "ground").stable).toBe(false);

  transitionOpenItem(obs, "confirmed", docsRoot);
  const after = computeAssessment(docsRoot, "ground");
  expect(after.questions.filter(q => q.round === "confirm").length).toBe(0);
  expect(after.stable).toBe(true);
});

test("a code-verified (closed-set) observation does not become a confirm question", () => {
  const docsRoot = setup();
  // entity-exists is auto-acceptable; it is not an inferred observation, so it
  // should never surface as a confirm question even while item_state is open.
  createOrUpsertOpenItem(
    {
      kind: "observation",
      title: "Express app entry exists",
      provenance: "code-verified",
      fact_kind: "entity-exists",
      anchors: ["src/app.ts#L1-L20"],
      claim: "The Express app is bootstrapped in src/app.ts",
    },
    docsRoot,
  );
  const a = computeAssessment(docsRoot, "ground");
  expect(a.questions.filter(q => q.round === "confirm").length).toBe(0);
});

// ---------------------------------------------------------------------------
// Partition: open-item / tech-surface / glossary artifacts must NOT be flagged
// by detectGaps (untraced-artifact / fr-without-story) nor become domainQuestions.
// ---------------------------------------------------------------------------
test("partition: tech-surface / glossary / open-item artifacts produce no spurious gap or domain question", () => {
  const docsRoot = setup();
  const base = (fm: Partial<Frontmatter>): Frontmatter => ({
    id: "X", type: "tech-surface", title: "t", status: "draft", version: 1, updated: "d", ...fm,
  });
  // A tech-surface map with no derived_from — would trip untraced-artifact if it
  // were treated as normative.
  writeArtifact({ frontmatter: base({ id: "TSF-001", type: "tech-surface", title: "Routes" }), body: "" }, docsRoot);
  // A file-backed glossary artifact with no derived_from.
  writeArtifact({ frontmatter: base({ id: "GLO-002", type: "glossary", title: "Terms" }), body: "" }, docsRoot);
  // An open-item also lives in listArtifacts.
  createOrUpsertOpenItem({ kind: "coverage-topic", title: "x", topic: "floor:scope" }, docsRoot);

  const a = computeAssessment(docsRoot, "stabilize");
  // No gap should reference a descriptive/open-item subject.
  const descriptiveIds = new Set(["TSF-001", "GLO-002"]);
  expect(a.gaps.every(g => !descriptiveIds.has(g.subject))).toBe(true);
  expect(a.gaps.some(g => g.kind === "untraced-artifact")).toBe(false);
  // No domain question should target a tech-surface / glossary / open-item.
  expect(a.questions.every(q => q.round !== "domain" || !/TSF-001|GLO-002/.test(q.topic))).toBe(true);
});

// ---------------------------------------------------------------------------
// Back-compat: a previously-stable empty stabilize project stays stable;
// floor:* topics do not collide with artifactId#idx domain answers.
// ---------------------------------------------------------------------------
test("back-compat: empty stabilize project (no open-items) is stable", () => {
  const docsRoot = setup();
  const a = computeAssessment(docsRoot, "stabilize");
  expect(a.stable).toBe(true);
  expect(a.questions.length).toBe(0);
});

test("back-compat: discovery with zero decisions and zero open-items still surfaces the surface round and is not stable", () => {
  const docsRoot = setup();
  const a = computeAssessment(docsRoot, "discovery");
  expect(a.round).toBe("surface");
  expect(a.questions.length).toBeGreaterThan(0);
  expect(a.questions.every(q => q.round === "surface")).toBe(true);
  expect(a.stable).toBe(false);
});

test("coexistence: surface round and open coverage-topic questions appear together in discovery", () => {
  const docsRoot = setup();
  createOrUpsertOpenItem({ kind: "coverage-topic", title: "Scope", topic: "floor:scope" }, docsRoot);
  const a = computeAssessment(docsRoot, "discovery");
  expect(a.questions.some(q => q.round === "surface")).toBe(true);
  expect(a.questions.some(q => q.topic === "floor:scope")).toBe(true);
  expect(listOpenItems(docsRoot).length).toBe(1); // computeAssessment did not create or mutate anything
});
