import { expect, test } from "vitest";
import { surfaceQuestions, gapQuestions, domainQuestions, coverageQuestions, observationQuestions } from "../../src/core/questions.js";
import type { Artifact, Frontmatter } from "../../src/core/types.js";

const openItem = (fm: Partial<Frontmatter>): Frontmatter => ({
  id: "OPI-001", type: "open-item", title: "t", status: "draft", version: 1, updated: "d",
  kind: "coverage-topic", item_state: "open", item_key: "k", ...fm,
});

const art = (fm: Partial<Frontmatter>): Artifact => ({
  frontmatter: { id: "US-001", type: "story", title: "t", status: "draft", version: 1, updated: "d", ...fm },
  body: "", filePath: "p",
});

test("surfaceQuestions returns the scope-setting bank tagged surface", () => {
  const qs = surfaceQuestions();
  expect(qs.length).toBeGreaterThanOrEqual(5);
  expect(qs.every(q => q.round === "surface")).toBe(true);
  expect(qs.some(q => q.topic === "scope")).toBe(true);
  expect(qs[0].ref).toMatch(/^Q-s\d+$/);
});

test("gapQuestions produces one gap-round question per gap", () => {
  const qs = gapQuestions([{ kind: "fr-without-story", subject: "FR-002", message: "FR-002 has no story." }]);
  expect(qs).toHaveLength(1);
  expect(qs[0].round).toBe("gap");
  expect(qs[0].text).toContain("FR-002");
});

test("domainQuestions emits checklist dimensions for a story", () => {
  const qs = domainQuestions([art({ id: "US-007", type: "story" })]);
  expect(qs.every(q => q.round === "domain")).toBe(true);
  expect(qs.some(q => /actor/i.test(q.text))).toBe(true);
  expect(qs.length).toBeGreaterThanOrEqual(4);
});

test("domainQuestions skips dimensions already answered by a decision with matching topic", () => {
  const story = art({ id: "US-001", type: "story" });
  const decision: Frontmatter = {
    id: "DEC-001", type: "decision", title: "q", status: "approved", version: 1, updated: "d", topic: "US-001#0",
  };
  const allQs = domainQuestions([story]);
  const filteredQs = domainQuestions([story], [decision]);
  expect(filteredQs.length).toBeLessThan(allQs.length);
  expect(filteredQs.every(q => q.topic !== "US-001#0")).toBe(true);
});

test("coverageQuestions emits one research-round question per OPEN coverage-topic, skipping terminal ones", () => {
  const items = [
    openItem({ id: "OPI-001", kind: "coverage-topic", topic: "floor:scope", item_state: "open" }),
    openItem({ id: "OPI-002", kind: "coverage-topic", topic: "plan:billing", item_state: "open" }),
    openItem({ id: "OPI-003", kind: "coverage-topic", topic: "floor:errors", item_state: "retired" }),
    openItem({ id: "OPI-004", kind: "observation", item_state: "open", fact_kind: "inferred" }),
  ];
  const qs = coverageQuestions(items);
  expect(qs.map(q => q.topic).sort()).toEqual(["floor:scope", "plan:billing"]);
  expect(qs.every(q => q.round === "research")).toBe(true);
});

test("observationQuestions emits a confirm-round question only for OPEN inferred observations", () => {
  const items = [
    openItem({ id: "OPI-001", kind: "observation", item_state: "open", fact_kind: "inferred", claim: "GET /users lists users" }),
    // closed-set / code-verified observation: not a confirm question.
    openItem({ id: "OPI-002", kind: "observation", item_state: "open", fact_kind: "entity-exists" }),
    // confirmed inferred: terminal, no longer gates.
    openItem({ id: "OPI-003", kind: "observation", item_state: "confirmed", fact_kind: "inferred" }),
    // coverage-topic is not an observation.
    openItem({ id: "OPI-004", kind: "coverage-topic", topic: "floor:scope", item_state: "open" }),
  ];
  const qs = observationQuestions(items);
  expect(qs).toHaveLength(1);
  expect(qs[0].topic).toBe("OPI-001");
  expect(qs[0].round).toBe("confirm");
  expect(qs[0].text).toContain("GET /users lists users");
});

test("surfaceQuestions seeds options only on the genuinely-fixed question (constraints)", () => {
  const qs = surfaceQuestions();
  const constraints = qs.find(q => q.topic === "constraints");
  const problem = qs.find(q => q.topic === "problem");
  // constraints is a fixed-choice question -> server-seeded options present.
  expect(constraints?.options?.length).toBeGreaterThanOrEqual(3);
  expect(constraints?.options).toContain("No hard constraints");
  // open-ended questions carry no seeded options (agent generates them).
  expect(problem && "options" in problem).toBe(false);
});
