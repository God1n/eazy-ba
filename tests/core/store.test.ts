import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeArtifact, readArtifact, listArtifacts, filePathFor } from "../../src/core/store.js";
import type { Frontmatter } from "../../src/core/types.js";

function fm(over: Partial<Frontmatter> = {}): Frontmatter {
  return { id: "US-001", type: "story", title: "Reset password", status: "draft",
    version: 1, updated: "2026-06-18", ...over };
}

test("writes then reads back artifact preserving unknown keys", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = join(root, "docs/ba");
  const path = writeArtifact({ frontmatter: { ...fm(), customKey: "keep" }, body: "## Story\nbody" }, docsRoot);
  expect(path).toBe(join(docsRoot, "05-stories/US-001-reset-password.md"));
  const back = readArtifact(path);
  expect(back.frontmatter.id).toBe("US-001");
  expect(back.frontmatter.customKey).toBe("keep");
  expect(back.body.trim()).toBe("## Story\nbody");
});

test("lists all file-backed artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = join(root, "docs/ba");
  writeArtifact({ frontmatter: fm(), body: "x" }, docsRoot);
  writeArtifact({ frontmatter: fm({ id: "FR-001", type: "fr", title: "Login" }), body: "y" }, docsRoot);
  const all = listArtifacts(docsRoot);
  expect(all.map(a => a.frontmatter.id).sort()).toEqual(["FR-001", "US-001"]);
});

test("filePathFor uses folder + slug", () => {
  expect(filePathFor(fm({ id: "FR-002", type: "fr", title: "Sign In Flow" }), "/d"))
    .toBe("/d/03-requirements/functional/FR-002-sign-in-flow.md");
});

test("listArtifacts returns artifacts sorted by id ascending", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = join(root, "docs/ba");
  // Write in intentionally non-alphabetical id order
  writeArtifact({ frontmatter: fm({ id: "US-003", type: "story", title: "C" }), body: "" }, docsRoot);
  writeArtifact({ frontmatter: fm({ id: "US-001", type: "story", title: "A" }), body: "" }, docsRoot);
  writeArtifact({ frontmatter: fm({ id: "US-002", type: "story", title: "B" }), body: "" }, docsRoot);
  writeArtifact({ frontmatter: fm({ id: "FR-001", type: "fr", title: "Login" }), body: "" }, docsRoot);
  const ids = listArtifacts(docsRoot).map(a => a.frontmatter.id);
  expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  expect(ids[0]).toBe("FR-001");
  expect(ids[ids.length - 1]).toBe("US-003");
});

test("filePathFor with all-punctuation title produces <id>.md (no trailing hyphen)", () => {
  const path = filePathFor(fm({ id: "US-007", type: "story", title: "!!!" }), "/d");
  expect(path).toBe("/d/05-stories/US-007.md");
});

test("filePathFor with normal title produces <id>-<slug>.md", () => {
  const path = filePathFor(fm({ id: "US-008", type: "story", title: "Hello World" }), "/d");
  expect(path).toBe("/d/05-stories/US-008-hello-world.md");
});
