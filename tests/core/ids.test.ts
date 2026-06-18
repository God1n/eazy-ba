import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeArtifact } from "../../src/core/store.js";
import { nextId } from "../../src/core/ids.js";
import type { Frontmatter } from "../../src/core/types.js";

const base = (over: Partial<Frontmatter>): Frontmatter =>
  ({ id: "", type: "story", title: "t", status: "draft", version: 1, updated: "2026-06-18", ...over });

test("first id starts at 001", () => {
  const docsRoot = join(mkdtempSync(join(tmpdir(), "ba-")), "docs/ba");
  expect(nextId("story", docsRoot)).toBe("US-001");
});

test("increments past existing max", () => {
  const docsRoot = join(mkdtempSync(join(tmpdir(), "ba-")), "docs/ba");
  writeArtifact({ frontmatter: base({ id: "US-001", title: "a" }), body: "" }, docsRoot);
  writeArtifact({ frontmatter: base({ id: "US-004", title: "b" }), body: "" }, docsRoot);
  expect(nextId("story", docsRoot)).toBe("US-005");
});
