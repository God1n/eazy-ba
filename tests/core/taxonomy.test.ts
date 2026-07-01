import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { recordDecision, getDecision } from "../../src/core/decisions.js";
import { ID_PREFIX, FILE_BACKED_TYPES, DESCRIPTIVE_TYPES, NORMATIVE_TYPES } from "../../src/core/types.js";
import type { ArtifactType } from "../../src/core/types.js";
import { CLOSED_FACT_KINDS } from "../../src/core/taxonomy.js";

// The set of every ArtifactType member. Kept in sync manually; the exhaustive-map
// tests below catch a new ArtifactType that forgot a prefix/folder entry.
const ALL_ARTIFACT_TYPES: ArtifactType[] = [
  "vision", "glossary", "persona", "fr", "nfr",
  "use-case", "story", "risk", "assumption", "decision",
  "open-item", "tech-surface",
];

function setup() {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  return join(root, "docs/ba");
}

// store.ts FOLDER is module-private; re-derive coverage via folderFor not throwing.
import { folderFor } from "../../src/core/store.js";

test("ID_PREFIX, FILE_BACKED_TYPES, and FOLDER each cover every ArtifactType", () => {
  for (const t of ALL_ARTIFACT_TYPES) {
    expect(ID_PREFIX[t], `ID_PREFIX missing ${t}`).toBeTruthy();
    // folderFor reads the exhaustive FOLDER record; an unmapped type yields undefined join
    expect(() => folderFor(t, "/tmp/docs"), `FOLDER missing ${t}`).not.toThrow();
    expect(folderFor(t, "/tmp/docs"), `FOLDER missing ${t}`).toContain("/tmp/docs");
  }
  // New file-backed types are registered so they persist/list.
  expect(FILE_BACKED_TYPES).toEqual(
    expect.arrayContaining(["glossary", "tech-surface", "open-item"]),
  );
  // Descriptive/normative partition is disjoint and uses real ArtifactType members.
  for (const t of [...DESCRIPTIVE_TYPES, ...NORMATIVE_TYPES]) {
    expect(ALL_ARTIFACT_TYPES).toContain(t);
  }
  expect(DESCRIPTIVE_TYPES.some(t => NORMATIVE_TYPES.includes(t))).toBe(false);
});

test("a decision with asked_round 'research' and 'confirm' round-trips", () => {
  const docsRoot = setup();
  const r = recordDecision(
    { question: "Researched scope?", answer: "yes", asked_round: "research", topic: "floor:scope", updated: "2026-06-30" },
    docsRoot,
  );
  const c = recordDecision(
    { question: "Confirm route?", answer: "confirmed", asked_round: "confirm", topic: "obs#1", updated: "2026-06-30" },
    docsRoot,
  );
  expect(getDecision(r, docsRoot)!.asked_round).toBe("research");
  expect(getDecision(c, docsRoot)!.asked_round).toBe("confirm");
});

test("CLOSED_FACT_KINDS holds only the auto-acceptable existence-class facts", () => {
  expect(CLOSED_FACT_KINDS).toContain("entity-exists");
  expect(CLOSED_FACT_KINDS).toContain("dependency-present");
  expect(CLOSED_FACT_KINDS).not.toContain("route-exists");
  expect(CLOSED_FACT_KINDS).not.toContain("middleware-present");
  expect(CLOSED_FACT_KINDS).not.toContain("config-key-exists");
});
