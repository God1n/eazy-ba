import { expect, test } from "vitest";
import { surfaceQuestions, gapQuestions, domainQuestions } from "../../src/core/questions.js";
import type { Artifact, Frontmatter } from "../../src/core/types.js";

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
