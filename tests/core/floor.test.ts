import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { recordDecision } from "../../src/core/decisions.js";
import { listOpenItems, transitionOpenItem } from "../../src/core/openItems.js";
import { computeAssessment } from "../../src/core/assessment.js";
import { FLOOR_TOPICS, floorOpenItemInputs } from "../../src/core/questions.js";

function setupDiscovery(): { root: string; docsRoot: string } {
  const root = mkdtempSync(join(tmpdir(), "ba-floor-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  return { root, docsRoot: join(root, "docs/ba") };
}

// A surface answer marks deep-round entry (discovery, decisions exist).
function recordSurfaceAnswer(docsRoot: string): void {
  recordDecision(
    { question: "Scope?", answer: "MVP", asked_round: "surface", topic: "scope", updated: "2026-06-30" },
    docsRoot,
  );
}

function floorTopicKeys(docsRoot: string): string[] {
  return listOpenItems(docsRoot)
    .filter(i => i.kind === "coverage-topic" && typeof i.topic === "string" && (i.topic as string).startsWith("floor:"))
    .map(i => i.topic as string);
}

// ---------------------------------------------------------------------------
// Floor source sanity: a broad, dimension-anchored baseline with prompts.
// ---------------------------------------------------------------------------
test("the floor is a broad set of dimension-keyed topics, each with a prompt", () => {
  expect(FLOOR_TOPICS.length).toBeGreaterThanOrEqual(7);
  for (const t of FLOOR_TOPICS) {
    expect(t.topic.startsWith("floor:")).toBe(true);
    expect(typeof t.prompt).toBe("string");
    expect(t.prompt.length).toBeGreaterThan(0);
  }
  // Keys are unique.
  const keys = new Set(FLOOR_TOPICS.map(t => t.topic));
  expect(keys.size).toBe(FLOOR_TOPICS.length);
  // floorOpenItemInputs mirrors FLOOR_TOPICS as coverage-topic inputs.
  const inputs = floorOpenItemInputs();
  expect(inputs.length).toBe(FLOOR_TOPICS.length);
  expect(inputs.every(i => i.kind === "coverage-topic" && (i.topic as string).startsWith("floor:"))).toBe(true);
});

// ---------------------------------------------------------------------------
// Happy: entering the discovery deep round (surface answers recorded) seeds the
// full floor as open coverage-topics; ba_assess returns floor questions.
// ---------------------------------------------------------------------------
test("entering the deep round seeds the full floor and ba_assess returns floor questions", () => {
  const { root, docsRoot } = setupDiscovery();
  recordSurfaceAnswer(docsRoot);

  const res = baAssess({ projectRoot: root });

  // Every floor topic is now an open coverage-topic on disk.
  const seeded = new Set(floorTopicKeys(docsRoot));
  for (const t of FLOOR_TOPICS) expect(seeded.has(t.topic)).toBe(true);
  expect(seeded.size).toBe(FLOOR_TOPICS.length);

  // ba_assess surfaces them as questions.
  const floorQs = res.questions.filter(q => q.topic.startsWith("floor:"));
  expect(floorQs.length).toBe(FLOOR_TOPICS.length);
  expect(res.stable).toBe(false);
});

// ---------------------------------------------------------------------------
// Edge: floor questions topics start with "floor:".
// ---------------------------------------------------------------------------
test("floor question topics start with floor:", () => {
  const { root, docsRoot } = setupDiscovery();
  recordSurfaceAnswer(docsRoot);
  const res = baAssess({ projectRoot: root });
  const floorQs = res.questions.filter(q => q.round === "research");
  expect(floorQs.length).toBeGreaterThan(0);
  expect(floorQs.every(q => q.topic.startsWith("floor:"))).toBe(true);
});

// ---------------------------------------------------------------------------
// Edge (artifact-independent): the floor is present even with zero real artifacts.
// ---------------------------------------------------------------------------
test("the floor is artifact-independent: present with zero real artifacts on disk", () => {
  const { root, docsRoot } = setupDiscovery();
  recordSurfaceAnswer(docsRoot);
  baAssess({ projectRoot: root });

  // Only decisions + open-items exist; no persona/fr/nfr/etc. real artifacts.
  const realArtifacts = listOpenItems(docsRoot); // all open-items
  expect(realArtifacts.length).toBe(FLOOR_TOPICS.length);
  // The floor was seeded with no real artifacts to anchor against.
  expect(floorTopicKeys(docsRoot).length).toBe(FLOOR_TOPICS.length);
});

// ---------------------------------------------------------------------------
// Edge (idempotent): calling ba_assess twice does not duplicate floor items.
// ---------------------------------------------------------------------------
test("seeding is idempotent: two ba_assess calls do not duplicate floor items", () => {
  const { root, docsRoot } = setupDiscovery();
  recordSurfaceAnswer(docsRoot);
  baAssess({ projectRoot: root });
  const afterFirst = floorTopicKeys(docsRoot).length;
  baAssess({ projectRoot: root });
  const afterSecond = floorTopicKeys(docsRoot).length;
  expect(afterFirst).toBe(FLOOR_TOPICS.length);
  expect(afterSecond).toBe(FLOOR_TOPICS.length);
});

// ---------------------------------------------------------------------------
// Edge (floor-only done): answer/retire the whole floor, no agent plan → stable=true.
// ---------------------------------------------------------------------------
test("floor-only is legitimately complete: answering the whole floor with no plan reaches stable=true", () => {
  const { root, docsRoot } = setupDiscovery();
  recordSurfaceAnswer(docsRoot);
  baAssess({ projectRoot: root });

  // Answer/retire every floor open-item.
  for (const oi of listOpenItems(docsRoot)) {
    if (oi.kind === "coverage-topic" && (oi.topic as string).startsWith("floor:")) {
      transitionOpenItem(oi.id as string, "answered", docsRoot);
    }
  }

  const res = baAssess({ projectRoot: root });
  expect(res.questions.length).toBe(0);
  expect(res.stable).toBe(true);
});

// ---------------------------------------------------------------------------
// Edge (back-compat): seeding only happens for fresh discovery deep-round entry.
// A stabilize project does NOT get floor-seeded and stays stable.
// ---------------------------------------------------------------------------
test("back-compat: a stabilize project is not floor-seeded and stays stable", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-floor-stab-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "stabilize" });
  const docsRoot = join(root, "docs/ba");

  const res = baAssess({ projectRoot: root });
  expect(floorTopicKeys(docsRoot).length).toBe(0); // no floor seeded
  expect(res.stable).toBe(true);
});

test("back-compat: a change project is not floor-seeded", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-floor-chg-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "change" });
  const docsRoot = join(root, "docs/ba");
  baAssess({ projectRoot: root });
  expect(floorTopicKeys(docsRoot).length).toBe(0);
});

// ---------------------------------------------------------------------------
// Edge (back-compat): floor keys never collide with existing domain `artifactId#idx`
// answers. A discovery project that already answered a domain topic keyed
// `artifactId#idx` is unaffected by the disjoint floor:* namespace.
// ---------------------------------------------------------------------------
test("back-compat: floor:* keys are disjoint from artifactId#idx domain answers", () => {
  const { root, docsRoot } = setupDiscovery();
  recordSurfaceAnswer(docsRoot);
  // A pre-existing domain answer keyed artifactId#idx.
  recordDecision(
    { question: "Story actor?", answer: "Admin", asked_round: "domain", topic: "STO-001#0", updated: "2026-06-30" },
    docsRoot,
  );
  baAssess({ projectRoot: root });

  const floorKeys = floorTopicKeys(docsRoot);
  // No floor key collides with the artifactId#idx domain key.
  expect(floorKeys.every(k => k !== "STO-001#0")).toBe(true);
  expect(floorKeys.every(k => !k.includes("#"))).toBe(true);
});

// ---------------------------------------------------------------------------
// Edge: floor seeding does not destabilize an already-stable discovery project
// whose surface answers exist but which was seeded once and fully answered.
// (Re-entry after completion must not re-open answered floor topics.)
// ---------------------------------------------------------------------------
test("re-entry after the floor is answered does not resurrect answered floor topics", () => {
  const { root, docsRoot } = setupDiscovery();
  recordSurfaceAnswer(docsRoot);
  baAssess({ projectRoot: root });
  for (const oi of listOpenItems(docsRoot)) {
    if (oi.kind === "coverage-topic") transitionOpenItem(oi.id as string, "answered", docsRoot);
  }
  // Re-assess: idempotent upsert must not re-open answered items.
  const res = baAssess({ projectRoot: root });
  expect(res.stable).toBe(true);
  // Each floor topic appears exactly once and is not re-opened.
  const a = computeAssessment(docsRoot, "discovery");
  expect(a.questions.filter(q => q.topic.startsWith("floor:")).length).toBe(0);
});
