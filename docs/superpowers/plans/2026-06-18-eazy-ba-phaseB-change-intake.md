# eazy-ba Phase B (Change Intake & Impact) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `change` session mode and a `ba_impact` tool so the BA can assess a mid-project change's blast radius, feasibility conflicts, and severity, ask follow-ups, record the change as a superseding decision, and update affected documents.

**Architecture:** Builds on the Phase A loop. Adds one pure core module (`impact.ts`), one tool (`ba_impact`), and additive extensions: a `change` value across the round/mode unions, decision `supersedes`/`superseded_by`/obsolete semantics, change-round question generation, and exclusion of obsolete decisions from coverage so changed artifacts re-surface and the loop re-converges.

**Tech Stack:** TypeScript (Node ≥18, ESM, strict), `@modelcontextprotocol/sdk`, `zod`, `gray-matter`, `yaml`, `vitest` (TDD).

## Global Constraints

- ESM TypeScript, strict mode; import paths use `.js` extensions.
- Markdown + YAML frontmatter remains the source of truth; writes preserve hand-edited bodies + unknown frontmatter keys.
- Additive only: no new artifact type, no new folders. Changes live in the existing `08-decisions/` ledger.
- Superseded decisions are kept on disk: `status: "obsolete"` + `superseded_by: <new id>`; the new change decision carries `supersedes: [<old ids>]` and `asked_round: "change"`.
- **Obsolete decisions MUST NOT count as coverage** (so a changed artifact re-surfaces for questioning and the loop re-converges).
- Severity (deterministic, no score): `high` if any `implemented` artifact is in the blast radius; `medium` if any `approved` artifact is in it OR total affected ≥ 5; else `low`.
- `ba_impact` creates nothing. The anti-assumption gate in `ba_apply` is unchanged.
- Public MCP surface after this plan adds exactly one tool: `ba_impact` (total 9).
- Version → `0.3.0` (ships Phase A + B together; A was merged but never published).
- TDD: failing test first; each task ends in a commit. Tests use real temp dirs (`mkdtempSync`), no mocks.

## Shared Data Shapes (keep consistent across tasks)

```ts
// session.ts — round/mode unions gain "change"
type Round = "surface" | "domain" | "gap" | "change";
interface Question { ref: string; text: string; topic: string; round: Round }
interface SessionState { mode: "discovery" | "stabilize" | "change"; round: Round; open_questions: Question[]; pending_apply: string[]; updated: string }

// decisions.ts
interface DecisionInput {
  question: string; answer: string;
  asked_round: Round; topic: string;
  ref?: string; supersedes?: string[]; updated?: string;
}

// impact.ts
interface Impact {
  blastRadius: { artifacts: string[]; decisions: string[] };
  conflicts: { reopened: string[]; contradicted: string[] };
  severity: "low" | "medium" | "high";
}
```

---

### Task 1: Widen round/mode unions + `ba_session_start` change mode

**Files:**
- Modify: `src/core/session.ts` (Question.round, SessionState.mode + round)
- Modify: `src/core/decisions.ts` (DecisionInput.asked_round)
- Modify: `src/core/assessment.ts` (computeAssessment mode param type)
- Modify: `src/tools/baSessionStart.ts` (mode enum + change round)
- Modify: `src/tools/baRecordAnswers.ts` (asked_round enum gains "change")
- Test: `tests/tools/baSessionStart-change.test.ts`

**Interfaces:**
- Produces: `"change"` is accepted everywhere a round/mode is typed; `baSessionStart({mode:"change"})` creates a session with `round:"change"`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { readSession } from "../../src/core/session.js";

test("starts a change-mode session at the change round", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const res = baSessionStart({ projectRoot: root, mode: "change" });
  expect(res.mode).toBe("change");
  expect(res.round).toBe("change");
  expect(readSession(join(root, "docs/ba"))!.mode).toBe("change");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/baSessionStart-change.test.ts`
Expected: FAIL — zod enum rejects `"change"` (mode is `discovery|stabilize`).

- [ ] **Step 3: Edit `src/core/session.ts`**

Change both union types to include `"change"`:

```ts
export interface Question {
  ref: string;
  text: string;
  topic: string;
  round: "surface" | "domain" | "gap" | "change";
}

export interface SessionState {
  mode: "discovery" | "stabilize" | "change";
  round: "surface" | "domain" | "gap" | "change";
  open_questions: Question[];
  pending_apply: string[];
  updated: string;
}
```

- [ ] **Step 4: Edit `src/core/decisions.ts`**

Widen `DecisionInput.asked_round`:

```ts
  asked_round: "surface" | "domain" | "gap" | "change";
```

- [ ] **Step 5: Edit `src/core/assessment.ts`**

Widen the `mode` parameter of `computeAssessment`:

```ts
export function computeAssessment(docsRoot: string, mode: "discovery" | "stabilize" | "change"): Assessment {
```

(Behaviorally `change` falls into the same else-branch as `stabilize` — only `discovery` with zero decisions takes the surface branch. No other change needed here.)

- [ ] **Step 6: Edit `src/tools/baSessionStart.ts`**

Add `"change"` to the schema enum and the fresh-session round:

```ts
export const baSessionStartSchema = z.object({
  projectRoot: z.string(),
  mode: z.enum(["discovery", "stabilize", "change"]),
});
```

And in the fresh-session branch, set the round (`discovery` → surface; `stabilize`/`change` → their own round):

```ts
    state = {
      mode: input.mode,
      round: input.mode === "discovery" ? "surface" : input.mode === "change" ? "change" : "gap",
      open_questions: [],
      pending_apply: [],
      updated: today,
    };
```

- [ ] **Step 7: Edit `src/tools/baRecordAnswers.ts`**

Widen the `asked_round` enum in the items schema:

```ts
    asked_round: z.enum(["surface", "domain", "gap", "change"]),
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/tools/baSessionStart-change.test.ts`
Expected: PASS.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: all prior tests still pass.

- [ ] **Step 10: Commit**

```bash
git add src/core/session.ts src/core/decisions.ts src/core/assessment.ts src/tools/baSessionStart.ts src/tools/baRecordAnswers.ts tests/tools/baSessionStart-change.test.ts
git commit -m "feat: add change round/mode across the loop unions"
```

---

### Task 2: Decision superseding (`supersedes` + `supersede`)

**Files:**
- Modify: `src/core/decisions.ts`
- Test: `tests/core/decisions-supersede.test.ts`

**Interfaces:**
- Consumes: `listArtifacts`, `writeArtifact` (store.ts); existing `recordDecision`/`getDecision`.
- Produces:
  - `recordDecision` writes `supersedes` into frontmatter when provided (via `DecisionInput.supersedes`).
  - `function supersede(oldId: string, newId: string, docsRoot: string): void` — sets the old decision's `status` to `"obsolete"` and `superseded_by` to `newId`, preserving everything else. Throws if `oldId` is not a decision.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { recordDecision, getDecision, supersede } from "../../src/core/decisions.js";

function docs(root: string) { return join(root, "docs/ba"); }

test("records a decision carrying supersedes", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const id = recordDecision({ question: "New auth?", answer: "OAuth", asked_round: "change", topic: "auth", supersedes: ["DEC-001"], updated: "2026-06-18" }, docs(root));
  expect((getDecision(id, docs(root))!.supersedes as string[])).toEqual(["DEC-001"]);
});

test("supersede marks the old decision obsolete with a back-link", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const oldId = recordDecision({ question: "Auth?", answer: "password", asked_round: "surface", topic: "auth", updated: "2026-06-18" }, docs(root));
  const newId = recordDecision({ question: "New auth?", answer: "OAuth", asked_round: "change", topic: "auth", supersedes: [oldId], updated: "2026-06-19" }, docs(root));
  supersede(oldId, newId, docs(root));
  const old = getDecision(oldId, docs(root))!;
  expect(old.status).toBe("obsolete");
  expect(old.superseded_by).toBe(newId);
});

test("supersede throws on a non-existent decision", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  expect(() => supersede("DEC-999", "DEC-001", docs(root))).toThrow(/DEC-999/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/decisions-supersede.test.ts`
Expected: FAIL — `supersede` not exported; `supersedes` not written.

- [ ] **Step 3: Edit `src/core/decisions.ts`**

Add `supersedes?: string[]` to `DecisionInput` (after `ref?`):

```ts
  ref?: string;
  supersedes?: string[];
  updated?: string;
```

In `recordDecision`, write it when present (place beside the existing `ref` spread):

```ts
    ...(input.ref ? { ref: input.ref } : {}),
    ...(input.supersedes ? { supersedes: input.supersedes } : {}),
```

Add the `supersede` helper at the end of the file:

```ts
export function supersede(oldId: string, newId: string, docsRoot: string): void {
  const artifact = listArtifacts(docsRoot).find(a => a.frontmatter.id === oldId && a.frontmatter.type === "decision");
  if (!artifact) throw new Error(`Decision not found: ${oldId}`);
  const fm = { ...artifact.frontmatter };
  fm.status = "obsolete";
  fm.superseded_by = newId;
  fm.updated = today();
  writeArtifact({ frontmatter: fm, body: artifact.body }, docsRoot);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/decisions-supersede.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/decisions.ts tests/core/decisions-supersede.test.ts
git commit -m "feat: add decision superseding (supersedes + supersede)"
```

---

### Task 3: Impact computation (`impact.ts`)

**Files:**
- Create: `src/core/impact.ts`
- Test: `tests/core/impact.test.ts`

**Interfaces:**
- Consumes: `Artifact`, `Frontmatter` (types.ts).
- Produces:
  - `interface Impact { blastRadius: { artifacts: string[]; decisions: string[] }; conflicts: { reopened: string[]; contradicted: string[] }; severity: "low" | "medium" | "high" }`
  - `function buildImpact(targets: string[], artifacts: Artifact[], decisions: Frontmatter[]): Impact`

Rules:
- Seed affected artifacts: a target that is a decision id seeds that decision's `informs` artifact ids; a target that is an artifact id seeds itself.
- Transitive closure: an artifact `x` is affected if any of its `implements`/`satisfies`/`refines` points to an already-affected artifact.
- `blastRadius.artifacts` = the affected set. `blastRadius.decisions` = target decision ids plus non-obsolete decisions whose `informs` intersects the affected set (deduped).
- `conflicts.reopened` = affected artifacts whose `status` is `approved` or `implemented`. `conflicts.contradicted` = targets that are decision ids.
- `severity`: `high` if any reopened artifact is `implemented`; else `medium` if any reopened is `approved` OR `(blastRadius.artifacts.length + blastRadius.decisions.length) >= 5`; else `low`.

- [ ] **Step 1: Write the failing test**

```ts
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
    art({ id: "FR-001", type: "fr", status: "approved" }),
    art({ id: "US-001", type: "story", implements: ["FR-001"], status: "implemented" }),
    art({ id: "US-002", type: "story", implements: ["FR-002"] }), // unrelated
  ];
  const decisions = [dec({ id: "DEC-001", informs: ["FR-001"] })];
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/impact.test.ts`
Expected: FAIL — cannot find module `impact.js`.

- [ ] **Step 3: Write `src/core/impact.ts`**

```ts
import type { Artifact, Frontmatter } from "./types.js";

export interface Impact {
  blastRadius: { artifacts: string[]; decisions: string[] };
  conflicts: { reopened: string[]; contradicted: string[] };
  severity: "low" | "medium" | "high";
}

const EDGE_KINDS = ["implements", "satisfies", "refines"] as const;

export function buildImpact(targets: string[], artifacts: Artifact[], decisions: Frontmatter[]): Impact {
  const artifactById = new Map(artifacts.map(a => [a.frontmatter.id, a]));
  const decisionById = new Map(decisions.map(d => [d.id, d]));
  const targetSet = new Set(targets);

  // Seed affected artifacts.
  const affected = new Set<string>();
  for (const t of targets) {
    if (artifactById.has(t)) affected.add(t);
    const d = decisionById.get(t);
    if (d) for (const id of ((d.informs as string[] | undefined) ?? [])) if (artifactById.has(id)) affected.add(id);
  }

  // Transitive closure over dependents (x depends on an affected id via its edges).
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of artifacts) {
      if (affected.has(a.frontmatter.id)) continue;
      const points = EDGE_KINDS.flatMap(k => (a.frontmatter[k] as string[] | undefined) ?? []);
      if (points.some(p => affected.has(p))) { affected.add(a.frontmatter.id); grew = true; }
    }
  }

  const blastArtifacts = [...affected];
  const blastDecisions = new Set<string>();
  for (const t of targets) if (decisionById.has(t)) blastDecisions.add(t);
  for (const d of decisions) {
    if (d.status === "obsolete") continue;
    const informs = (d.informs as string[] | undefined) ?? [];
    if (informs.some(id => affected.has(id))) blastDecisions.add(d.id);
  }

  const reopened = blastArtifacts.filter(id => {
    const s = artifactById.get(id)!.frontmatter.status;
    return s === "approved" || s === "implemented";
  });
  const contradicted = targets.filter(t => decisionById.has(t));

  const anyImplemented = reopened.some(id => artifactById.get(id)!.frontmatter.status === "implemented");
  const anyApproved = reopened.some(id => artifactById.get(id)!.frontmatter.status === "approved");
  const total = blastArtifacts.length + blastDecisions.size;
  const severity: Impact["severity"] = anyImplemented ? "high" : (anyApproved || total >= 5) ? "medium" : "low";

  return {
    blastRadius: { artifacts: blastArtifacts, decisions: [...blastDecisions] },
    conflicts: { reopened, contradicted },
    severity,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/impact.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/impact.ts tests/core/impact.test.ts
git commit -m "feat: add change-impact blast-radius computation"
```

---

### Task 4: Change questions + exclude obsolete decisions from coverage

**Files:**
- Modify: `src/core/questions.ts` (add `changeQuestions`)
- Modify: `src/core/assessment.ts` (filter obsolete decisions)
- Test: `tests/core/questions-change.test.ts`

**Interfaces:**
- Produces:
  - `function changeQuestions(affectedArtifactIds: string[]): Question[]` — one `round:"change"` question per affected artifact, refs `Q-c1`, `Q-c2`, …
  - `computeAssessment` no longer counts `obsolete` decisions as coverage (so superseded dimensions re-surface).

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changeQuestions } from "../../src/core/questions.js";
import { baInit } from "../../src/tools/baInit.js";
import { recordDecision, supersede } from "../../src/core/decisions.js";
import { computeAssessment } from "../../src/core/assessment.js";
import { baCreateArtifact } from "../../src/tools/baCreateArtifact.js";

test("changeQuestions emits one change-round question per affected artifact", () => {
  const qs = changeQuestions(["US-001", "FR-002"]);
  expect(qs).toHaveLength(2);
  expect(qs.every(q => q.round === "change")).toBe(true);
  expect(qs[0].ref).toBe("Q-c1");
  expect(qs[0].topic).toBe("US-001");
});

test("an obsolete decision no longer covers its domain dimension", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = join(root, "docs/ba");
  baInit({ projectRoot: root });
  // a story exists; record a decision covering its dimension 0, then a second to keep decisions>0 after obsolete
  baCreateArtifact({ projectRoot: root, type: "story", title: "Login", body: "Given a When b Then c", updated: "2026-06-18" } as any);
  const keep = recordDecision({ question: "k", answer: "a", asked_round: "surface", topic: "scope", updated: "2026-06-18" }, docsRoot);
  const cover = recordDecision({ question: "actor?", answer: "agent", asked_round: "domain", topic: "US-001#0", updated: "2026-06-18" }, docsRoot);
  const before = computeAssessment(docsRoot, "stabilize").questions.filter(q => q.topic === "US-001#0");
  expect(before).toHaveLength(0); // covered
  supersede(cover, keep, docsRoot); // obsolete the covering decision
  const after = computeAssessment(docsRoot, "stabilize").questions.filter(q => q.topic === "US-001#0");
  expect(after.length).toBeGreaterThan(0); // re-surfaced
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/questions-change.test.ts`
Expected: FAIL — `changeQuestions` not exported; obsolete decision still counts as coverage.

- [ ] **Step 3: Edit `src/core/questions.ts`**

Add at the end:

```ts
export function changeQuestions(affectedArtifactIds: string[]): Question[] {
  return affectedArtifactIds.map((id, i) => ({
    ref: `Q-c${i + 1}`,
    text: `How does the change affect ${id}? State exactly what must change and what stays the same.`,
    topic: id,
    round: "change",
  }));
}
```

- [ ] **Step 4: Edit `src/core/assessment.ts`**

Filter obsolete decisions where coverage is computed. Change the decisions line:

```ts
  const decisions = listDecisions(docsRoot).filter(d => d.status !== "obsolete");
```

(This single filtered list already feeds both the `decisions.length === 0` surface guard and `domainQuestions(artifacts, decisions)`, so obsolete decisions stop counting as coverage.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/core/questions-change.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/questions.ts src/core/assessment.ts tests/core/questions-change.test.ts
git commit -m "feat: add change questions and exclude obsolete decisions from coverage"
```

---

### Task 5: `ba_impact` tool

**Files:**
- Create: `src/tools/baImpact.ts`
- Test: `tests/tools/baImpact.test.ts`

**Interfaces:**
- Consumes: `resolveConfig`; `listArtifacts` (store.ts); `listDecisions` (decisions.ts); `buildImpact`, `Impact` (impact.ts); `changeQuestions` (questions.ts); `Question` (session.ts).
- Produces:
  - `const baImpactSchema = z.object({ projectRoot: z.string(), targets: z.array(z.string()).min(1) })`
  - `function baImpact(input): Impact & { consequences: string; questions: Question[] }` — validates each target exists (as an artifact or a decision), else throws `Unknown target: <id>`; computes impact over non-decision artifacts + all decisions; builds `changeQuestions` over the affected artifacts; assembles a `consequences` summary string. Creates nothing.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { baApply } from "../../src/tools/baApply.js";
import { baImpact } from "../../src/tools/baImpact.js";

function seedStory(root: string): string {
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  baRecordAnswers({ projectRoot: root, items: [{ question: "scope?", answer: "x", asked_round: "surface", topic: "scope" }] });
  const res = baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Login", body: "Given a When b Then c", status: "implemented", derived_from: ["DEC-001"] },
  ] });
  return res.applied[0].id;
}

test("ba_impact reports blast radius, severity, consequences, and change questions", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const usId = seedStory(root);
  const res = baImpact({ projectRoot: root, targets: [usId] });
  expect(res.blastRadius.artifacts).toContain(usId);
  expect(res.severity).toBe("high"); // implemented story
  expect(res.questions.every(q => q.round === "change")).toBe(true);
  expect(res.consequences).toMatch(/severity/i);
});

test("ba_impact throws on an unknown target", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  seedStory(root);
  expect(() => baImpact({ projectRoot: root, targets: ["US-404"] })).toThrow(/US-404/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/baImpact.test.ts`
Expected: FAIL — cannot find module `baImpact.js`.

- [ ] **Step 3: Write `src/tools/baImpact.ts`**

```ts
import { z } from "zod";
import { resolveConfig } from "../config.js";
import { listArtifacts } from "../core/store.js";
import { listDecisions } from "../core/decisions.js";
import { buildImpact, type Impact } from "../core/impact.js";
import { changeQuestions } from "../core/questions.js";
import type { Question } from "../core/session.js";

export const baImpactSchema = z.object({
  projectRoot: z.string(),
  targets: z.array(z.string()).min(1),
});

export function baImpact(input: z.infer<typeof baImpactSchema>): Impact & { consequences: string; questions: Question[] } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const all = listArtifacts(docsRoot);
  const artifacts = all.filter(a => a.frontmatter.type !== "decision");
  const decisions = listDecisions(docsRoot);

  const known = new Set<string>([...artifacts.map(a => a.frontmatter.id), ...decisions.map(d => d.id)]);
  for (const t of input.targets) {
    if (!known.has(t)) throw new Error(`Unknown target: ${t}. It is neither an artifact nor a decision.`);
  }

  const impact = buildImpact(input.targets, artifacts, decisions);
  const questions = changeQuestions(impact.blastRadius.artifacts);
  const consequences =
    `This change affects ${impact.blastRadius.artifacts.length} artifact(s) and ` +
    `${impact.blastRadius.decisions.length} decision(s). ` +
    `Reopens committed work: ${impact.conflicts.reopened.join(", ") || "none"}. ` +
    `Severity: ${impact.severity}. Confirm before applying.`;

  return { ...impact, consequences, questions };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/baImpact.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/baImpact.ts tests/tools/baImpact.test.ts
git commit -m "feat: add ba_impact tool"
```

---

### Task 6: `ba_record_answers` supersede support

**Files:**
- Modify: `src/tools/baRecordAnswers.ts`
- Test: `tests/tools/baRecordAnswers-supersede.test.ts`

**Interfaces:**
- Consumes: `recordDecision`, `listDecisions`, `getDecision`, `supersede` (decisions.ts).
- Produces: items gain optional `supersedes: string[]`. When an item has `supersedes`, each id is validated as an existing decision (pre-flight; throws otherwise), the new decision is recorded with `supersedes`, and each old decision is superseded (obsolete + `superseded_by`).

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { getDecision } from "../../src/core/decisions.js";

function docs(root: string) { return join(root, "docs/ba"); }

test("recording a change answer supersedes the cited decision", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  baRecordAnswers({ projectRoot: root, items: [{ question: "Auth?", answer: "password", asked_round: "surface", topic: "auth" }] }); // DEC-001
  const res = baRecordAnswers({ projectRoot: root, items: [
    { question: "Change auth?", answer: "OAuth", asked_round: "change", topic: "auth", supersedes: ["DEC-001"] },
  ] }); // DEC-002
  const newId = res.recorded[0];
  expect((getDecision(newId, docs(root))!.supersedes as string[])).toEqual(["DEC-001"]);
  const old = getDecision("DEC-001", docs(root))!;
  expect(old.status).toBe("obsolete");
  expect(old.superseded_by).toBe(newId);
});

test("supersedes referencing a non-existent decision throws", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "change" });
  expect(() => baRecordAnswers({ projectRoot: root, items: [
    { question: "q", answer: "a", asked_round: "change", topic: "t", supersedes: ["DEC-999"] },
  ] })).toThrow(/DEC-999/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/baRecordAnswers-supersede.test.ts`
Expected: FAIL — `supersedes` not in schema; not superseding.

- [ ] **Step 3: Edit `src/tools/baRecordAnswers.ts`**

Add `supersede`, `getDecision` to the decisions import:

```ts
import { recordDecision, listDecisions, getDecision, supersede } from "../core/decisions.js";
```

Add `supersedes` to the items schema:

```ts
    ref: z.string().optional(),
    supersedes: z.array(z.string()).optional(),
```

Pre-flight validate all `supersedes` ids before recording (insert right after the no-session check):

```ts
  for (const item of input.items) {
    for (const old of item.supersedes ?? []) {
      if (!getDecision(old, docsRoot)) throw new Error(`Cannot supersede unknown decision: ${old}`);
    }
  }
```

After recording each item's decision (inside the existing loop, where `recordDecision` is called), supersede its cited decisions. Replace the record line:

```ts
    const newId = recordDecision(item, docsRoot);
    recorded.push(newId);
    if (item.ref) seenRefs.add(item.ref);
    for (const old of item.supersedes ?? []) supersede(old, newId, docsRoot);
```

(`recordDecision` already accepts `supersedes` via `DecisionInput` from Task 2, so the new decision's frontmatter carries it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/baRecordAnswers-supersede.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all pass (existing baRecordAnswers tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/tools/baRecordAnswers.ts tests/tools/baRecordAnswers-supersede.test.ts
git commit -m "feat: ba_record_answers supersedes prior decisions on change"
```

---

### Task 7: Register `ba_impact`, instructions, version 0.3.0

**Files:**
- Modify: `src/index.ts`
- Modify: `src/instructions.ts`
- Modify: `package.json` (version 0.3.0)
- Modify: `tests/smoke.test.ts` (VERSION 0.3.0)
- Test: `tests/index.test.ts` (extend)

**Interfaces:**
- Produces: `buildServer` registers `ba_impact`; `VERSION === "0.3.0"`; instructions describe change mode.

- [ ] **Step 1: Write the failing test (extend `tests/index.test.ts`)**

```ts
test("instructions describe change mode and ba_impact", () => {
  expect(INSTRUCTIONS).toMatch(/change/i);
  expect(INSTRUCTIONS).toMatch(/ba_impact/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/index.test.ts`
Expected: FAIL — INSTRUCTIONS does not mention ba_impact yet.

- [ ] **Step 3: Edit `src/index.ts`**

Add the import and registration (alongside the other tools). Import:

```ts
import { baImpact, baImpactSchema } from "./tools/baImpact.js";
```

Register (place after `ba_status`):

```ts
  server.registerTool("ba_impact",
    { description: "For a mid-project change: report blast radius, conflicts, severity, consequences, and change questions for the given target ids. Creates nothing.", inputSchema: baImpactSchema.shape }, wrap(baImpact));
```

Bump the version constant:

```ts
export const VERSION = "0.3.0";
```

- [ ] **Step 4: Edit `src/instructions.ts`**

Append a change-mode paragraph to `INSTRUCTIONS` (keep the existing text):

```ts
For a change mid-project: start a session with mode "change", find the affected decision/artifact ids with ba_get/ba_list, then call ba_impact with those targets to see the blast radius, conflicts, severity, and consequences. Present the consequences and confirm with the user before committing. Record the change with ba_record_answers including supersedes:[<old decision ids>] so the prior decisions are marked obsolete, then ba_apply the updates. Re-run ba_assess until ba_status is stable again.
```

- [ ] **Step 5: Bump `package.json`**

Change `"version": "0.2.0"` to `"version": "0.3.0"`.

- [ ] **Step 6: Update `tests/smoke.test.ts`**

Change `expect(VERSION).toBe("0.2.0");` to `expect(VERSION).toBe("0.3.0");`.

- [ ] **Step 7: Run the full suite + build**

Run: `npm test`
Expected: all pass.
Run: `npm run build`
Expected: clean compile; `dist/knowledge/` present.

- [ ] **Step 8: Commit**

```bash
git add src/index.ts src/instructions.ts package.json tests/smoke.test.ts tests/index.test.ts
git commit -m "feat: register ba_impact, document change mode, bump to 0.3.0"
```

---

### Task 8: End-to-end change-flow integration test

**Files:**
- Test: `tests/integration/change.test.ts`

**Interfaces:**
- Consumes: all loop + change tools.
- Produces: proof of the full change cycle and re-convergence.

- [ ] **Step 1: Write the integration test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { baApply } from "../../src/tools/baApply.js";
import { baImpact } from "../../src/tools/baImpact.js";
import { getDecision } from "../../src/core/decisions.js";

test("change flow: impact → supersede → update → old decision obsolete", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = join(root, "docs/ba");

  // Discover: record a decision, apply a story derived from it.
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  baRecordAnswers({ projectRoot: root, items: [{ question: "Auth?", answer: "password", asked_round: "surface", topic: "auth" }] }); // DEC-001
  const created = baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Sign in", body: "Given a When b Then c", derived_from: ["DEC-001"] },
  ] });
  const usId = created.applied[0].id;
  // baApply create always starts as draft; promote to approved via update so the
  // change below reopens committed work (severity medium).
  baApply({ projectRoot: root, artifacts: [
    { op: "update", id: usId, status: "approved", derived_from: ["DEC-001"] },
  ] });

  // Change: assess impact of changing DEC-001.
  baSessionStart({ projectRoot: root, mode: "change" });
  const impact = baImpact({ projectRoot: root, targets: ["DEC-001"] });
  expect(impact.blastRadius.artifacts).toContain(usId);
  expect(impact.severity).toBe("medium"); // approved story reopened

  // Record the change as a superseding decision, then update the story.
  const rec = baRecordAnswers({ projectRoot: root, items: [
    { question: "Change auth to OAuth?", answer: "Yes, OAuth only", asked_round: "change", topic: "auth", supersedes: ["DEC-001"] },
  ] });
  const changeDec = rec.recorded[0];
  baApply({ projectRoot: root, artifacts: [
    { op: "update", id: usId, body: "Given a user When they use OAuth Then they sign in", status: "draft", derived_from: [changeDec] },
  ] });

  // Old decision is obsolete and linked; story now derives from the change decision.
  expect(getDecision("DEC-001", docsRoot)!.status).toBe("obsolete");
  expect(getDecision("DEC-001", docsRoot)!.superseded_by).toBe(changeDec);
  const files = readdirSync(join(docsRoot, "05-stories"));
  const content = readFileSync(join(docsRoot, "05-stories", files.find(f => f.includes(usId))!), "utf8");
  expect(content).toContain(changeDec);
});
```

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run tests/integration/change.test.ts`
Expected: PASS.

- [ ] **Step 3: Run the full suite + build**

Run: `npm test && npm run build`
Expected: all pass; clean build.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/change.test.ts
git commit -m "test: end-to-end change intake, supersede, and update flow"
```

---

## Self-Review

**Spec coverage:**
- `change` session mode → Task 1.
- `ba_impact` (blast radius, conflicts, severity, consequences, questions) → Tasks 3 (compute) + 5 (tool).
- Supersede-with-link (new `supersedes`; old → obsolete + `superseded_by`) → Tasks 2 (core) + 6 (record_answers).
- Obsolete decisions excluded from coverage (re-convergence) → Task 4.
- Change-round questions → Task 4 (`changeQuestions`) + 5 (surfaced by `ba_impact`).
- Severity tiers (high/medium/low) verbatim from the spec → Task 3.
- Register tool + instructions + version 0.3.0 → Task 7.
- End-to-end change flow + re-convergence → Task 8.
- **Deferred (Phase C):** lint, visualization, codebase grounding.

**Placeholder scan:** No TBD/TODO; every code step has complete code.

**Type consistency:** The `Round` union (`surface|domain|gap|change`) is widened in Task 1 across `Question`, `SessionState`, `DecisionInput`, `computeAssessment`, and the two tool schemas before any later task relies on `"change"`. `Impact`, `buildImpact`, `supersede`, `changeQuestions`, `baImpact` signatures are defined once and consumed with matching shapes. `ba_apply` is reused unchanged (the agent issues `op:update` specs citing the change decision).

---

## Notes for Phase C

Lint (ambiguity/testability), Mermaid visualization of the decision↔artifact graph, and codebase grounding for question generation — each its own brainstorm → plan → build cycle.
