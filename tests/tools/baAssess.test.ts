import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { recordDecision } from "../../src/core/decisions.js";

test("fresh discovery assess returns surface questions and is not stable", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  const res = baAssess({ projectRoot: root });
  expect(res.round).toBe("surface");
  expect(res.questions.length).toBeGreaterThanOrEqual(5);
  expect(res.stable).toBe(false);
});

test("after a decision exists, assess moves past surface", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  recordDecision({ question: "Scope?", answer: "MVP", asked_round: "surface", topic: "scope", updated: "2026-06-18" }, join(root, "docs/ba"));
  const res = baAssess({ projectRoot: root });
  expect(res.round).not.toBe("surface");
});

test("throws when no session started", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  expect(() => baAssess({ projectRoot: root })).toThrow();
});

// ---------------------------------------------------------------------------
// Integration (surface→research, R1): once surface answers are recorded, the
// deep round opens and ba_assess emits a research directive telling the host
// agent to research the domain and call ba_plan. The session is NOT vacuously
// stable (the floor is seeded — Unit 5).
// ---------------------------------------------------------------------------
test("surface→research transition: assess emits the research directive and is not vacuously stable", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-rd-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  // A fresh surface assess must NOT carry a research directive yet.
  const surface = baAssess({ projectRoot: root });
  expect(surface.researchDirective).toBeUndefined();

  recordDecision(
    { question: "Scope?", answer: "MVP", asked_round: "surface", topic: "scope", updated: "2026-06-30" },
    join(root, "docs/ba"),
  );
  const res = baAssess({ projectRoot: root });
  expect(typeof res.researchDirective).toBe("string");
  expect(res.researchDirective!.toLowerCase()).toContain("ba_plan");
  expect(res.stable).toBe(false);
});

// ---------------------------------------------------------------------------
// Advisory, not spammy: once a plan exists, the research directive stops.
// ---------------------------------------------------------------------------
test("research directive stops once a plan has been declared", async () => {
  const root = mkdtempSync(join(tmpdir(), "ba-rd2-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  recordDecision(
    { question: "Scope?", answer: "MVP", asked_round: "surface", topic: "scope", updated: "2026-06-30" },
    join(root, "docs/ba"),
  );
  baAssess({ projectRoot: root }); // directive present here
  const { baPlan } = await import("../../src/tools/baPlan.js");
  baPlan({ projectRoot: root, operations: [{ op: "declare", topic: "some-topic" }] });
  const res = baAssess({ projectRoot: root });
  expect(res.researchDirective).toBeUndefined();
});
