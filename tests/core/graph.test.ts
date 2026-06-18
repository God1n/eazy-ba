import { expect, test } from "vitest";
import { buildGraph } from "../../src/core/graph.js";
import type { Artifact, Frontmatter } from "../../src/core/types.js";

const art = (fm: Partial<Frontmatter>): Artifact => ({
  frontmatter: { id: "X", type: "story", title: "t", status: "draft", version: 1, updated: "d", ...fm },
  body: "", filePath: "p",
});

test("builds edges and detects dangling targets", () => {
  const g = buildGraph([
    art({ id: "US-001", type: "story", implements: ["FR-001"], satisfies: ["PER-009"] }),
    art({ id: "FR-001", type: "fr" }),
  ]);
  expect(g.ids.has("US-001")).toBe(true);
  expect(g.edges).toContainEqual({ from: "US-001", to: "FR-001", kind: "implements" });
  expect(g.danglingTargets).toContain("PER-009");
});
