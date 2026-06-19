import { expect, test } from "vitest";
import { buildImpact } from "../../src/core/impact.js";
import type { Artifact, Frontmatter } from "../../src/core/types.js";

const art = (fm: Partial<Frontmatter>, body = ""): Artifact => ({
  frontmatter: { id: "X", type: "story", title: "t", status: "draft", version: 1, updated: "d", ...fm },
  body, filePath: "p",
});
const dec = (fm: Partial<Frontmatter>): Frontmatter =>
  ({ id: "DEC-001", type: "decision", title: "q", status: "approved", version: 1, updated: "d", informs: [], ...fm });

test("blast radius from a decision reaches its informed artifact and dependents", () => {
  const artifacts = [
    art({ id: "FR-001", type: "fr", status: "approved", derived_from: ["DEC-001"] }),
    art({ id: "US-001", type: "story", implements: ["FR-001"], status: "implemented" }),
    art({ id: "US-002", type: "story", implements: ["FR-002"] }), // unrelated
  ];
  const decisions = [dec({ id: "DEC-001" })];
  const impact = buildImpact(["DEC-001"], artifacts, decisions);
  expect(impact.blastRadius.artifacts.sort()).toEqual(["FR-001", "US-001"]);
  expect(impact.blastRadius.decisions).toContain("DEC-001");
  expect(impact.conflicts.reopened.sort()).toEqual(["FR-001", "US-001"]);
  expect(impact.conflicts.contradicted).toEqual(["DEC-001"]);
  expect(impact.severity).toBe("high"); // US-001 is implemented
});

test("approved-only blast radius is medium; tiny draft-only is low", () => {
  const approved = buildImpact(["FR-001"], [art({ id: "FR-001", type: "fr", status: "approved" })], []);
  expect(approved.severity).toBe("medium");
  const low = buildImpact(["FR-001"], [art({ id: "FR-001", type: "fr", status: "draft" })], []);
  expect(low.severity).toBe("low");
});
