import { expect, test } from "vitest";
import { detectGaps } from "../../src/core/gaps.js";
import type { Artifact, Frontmatter } from "../../src/core/types.js";

const art = (fm: Partial<Frontmatter>, body = ""): Artifact => ({
  frontmatter: { id: "X", type: "story", title: "t", status: "draft", version: 1, updated: "d", ...fm },
  body, filePath: "p",
});

test("flags story without acceptance criteria, untraced fr, fr without story, dangling link", () => {
  const gaps = detectGaps([
    art({ id: "US-001", type: "story", derived_from: ["DEC-001"], implements: ["FR-001"] }, "## Story\nno AC here"),
    art({ id: "FR-001", type: "fr" }),                       // untraced (no derived_from) AND has a story -> not fr-without-story
    art({ id: "FR-002", type: "fr", derived_from: ["DEC-002"] }), // traced but no story implements it
    art({ id: "US-009", type: "story", derived_from: ["DEC-003"], satisfies: ["PER-404"] }, "Given x When y Then z"),
  ]);
  const kinds = gaps.map(g => `${g.kind}:${g.subject}`);
  expect(kinds).toContain("story-without-acceptance-criteria:US-001");
  expect(kinds).toContain("untraced-artifact:FR-001");
  expect(kinds).toContain("fr-without-story:FR-002");
  expect(kinds).toContain("dangling-link:PER-404");
});

test("clean project yields no gaps", () => {
  const gaps = detectGaps([
    art({ id: "FR-001", type: "fr", derived_from: ["DEC-001"] }),
    art({ id: "US-001", type: "story", derived_from: ["DEC-002"], implements: ["FR-001"] }, "Given a When b Then c"),
  ]);
  expect(gaps).toEqual([]);
});
