import { expect, test } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baCreateArtifact } from "../../src/tools/baCreateArtifact.js";
import { baLink } from "../../src/tools/baLink.js";

test("links story to requirement and warns on unknown target", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const fr = baCreateArtifact({ projectRoot: root, type: "fr", title: "Login", updated: "2026-06-18" } as any);
  const us = baCreateArtifact({ projectRoot: root, type: "story", title: "Sign in", updated: "2026-06-18" } as any);

  const ok = baLink({ projectRoot: root, from: us.id, to: fr.id, kind: "implements" });
  expect(ok.warning).toBeUndefined();
  expect(readFileSync(us.filePath, "utf8")).toContain(fr.id);

  const warn = baLink({ projectRoot: root, from: us.id, to: "FR-999", kind: "implements" });
  expect(warn.warning).toMatch(/FR-999/);
});
