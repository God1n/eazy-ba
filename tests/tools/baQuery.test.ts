import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baCreateArtifact } from "../../src/tools/baCreateArtifact.js";
import { baGet, baList } from "../../src/tools/baQuery.js";

test("get returns artifact; list filters by type", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const us = baCreateArtifact({ projectRoot: root, type: "story", title: "Sign in", updated: "2026-06-18" } as any);
  baCreateArtifact({ projectRoot: root, type: "fr", title: "Login", updated: "2026-06-18" } as any);

  expect(baGet({ projectRoot: root, id: us.id }).frontmatter.title).toBe("Sign in");
  const stories = baList({ projectRoot: root, type: "story" });
  expect(stories).toHaveLength(1);
  expect(stories[0].id).toBe(us.id);
});

test("get throws on missing id", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  expect(() => baGet({ projectRoot: root, id: "US-001" })).toThrow();
});
