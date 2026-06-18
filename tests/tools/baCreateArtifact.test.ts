import { expect, test } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baCreateArtifact } from "../../src/tools/baCreateArtifact.js";

test("creates a story with id, gherkin template, and links", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const res = baCreateArtifact({
    projectRoot: root, type: "story", title: "Reset password",
    priority: "must", implements: ["FR-001"], updated: "2026-06-18",
  } as any);
  expect(res.id).toBe("US-001");
  const text = readFileSync(res.filePath, "utf8");
  expect(text).toContain("id: US-001");
  expect(text).toContain("priority: must");
  expect(text).toContain("Acceptance Criteria");
  expect(text).toContain("Given");
});
