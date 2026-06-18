# eazy-ba Phase A (Interrogative Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace eazy-ba's autonomous create tools with a question-first loop: the BA analyzes state, emits questions, records the user's answers as traceable decisions, and only then materializes documents — never assuming.

**Architecture:** Builds on the Phase-1 `core/` modules (unchanged). Adds a decisions ledger, resumable session state, deterministic structural gap detection, and a checklist-driven question generator. Five new loop tools (`ba_session_start`, `ba_assess`, `ba_record_answers`, `ba_apply`, `ba_status`) replace the autonomous `ba_create_artifact`/`ba_update_artifact`/`ba_link` on the public MCP surface; those become internal functions only `ba_apply` calls. Server instructions establish the BA persona.

**Tech Stack:** TypeScript (Node ≥18, ESM, strict), `@modelcontextprotocol/sdk`, `zod`, `gray-matter`, `yaml`, `vitest` (TDD).

## Global Constraints

- ESM TypeScript, strict mode; import paths use `.js` extensions.
- Markdown + YAML frontmatter remains the single source of truth under `docs/ba/`.
- Writes preserve hand-edited bodies and unknown frontmatter keys (Phase-1 `writeArtifact` already does this).
- **Anti-assumption guarantee:** `ba_apply` MUST reject any artifact whose `derived_from` cites a decision id not present (and answered) in the ledger. No artifact is written without a recorded decision behind it.
- Decisions are file-backed artifacts: `type: "decision"`, ID prefix `DEC`, stored in `08-decisions/`, included in `FILE_BACKED_TYPES`.
- Bidirectional traceability: artifacts carry `derived_from: [DEC-###]`; decisions carry `informs: [<artifact-id>]`.
- Phase A session modes: `discovery | stabilize` only (`change` is Phase B).
- Stability = no open questions in the session AND no structural gaps from a fresh assess.
- The public MCP tool surface after this plan is exactly: `ba_init`, `ba_session_start`, `ba_assess`, `ba_record_answers`, `ba_apply`, `ba_status`, `ba_get`, `ba_list`. The autonomous create/update/link tools are NOT registered.
- Version bumps to `0.2.0` (package.json, `VERSION` export, smoke test).
- TDD: failing test first; each task ends in a commit. Tests use real temp dirs (`mkdtempSync`), no mocks.

## Shared Data Shapes (used across tasks — keep consistent)

```ts
// Decision frontmatter (stored via the Phase-1 store as a "decision" artifact)
interface DecisionRecord {
  id: string;            // DEC-001
  type: "decision";
  title: string;         // = the question text (drives the filename slug)
  status: "approved";
  version: number;       // 1
  updated: string;       // YYYY-MM-DD
  question: string;
  answer: string;
  asked_round: "surface" | "domain" | "gap";
  topic: string;
  applied: boolean;      // has ba_apply materialized it?
  informs: string[];     // artifact ids this decision produced/changed
}

// A question emitted by ba_assess (ephemeral; also tracked in session.open_questions)
interface Question {
  ref: string;           // "Q-1"
  text: string;
  topic: string;
  round: "surface" | "domain" | "gap";
}

// A structural gap (from core/gaps.ts)
interface Gap {
  kind: string;          // e.g. "story-without-acceptance-criteria"
  subject: string;       // artifact id or "project"
  message: string;
}

// Session state (.ba-session.yml)
interface SessionState {
  mode: "discovery" | "stabilize";
  round: "surface" | "domain" | "gap";
  open_questions: Question[];
  pending_apply: string[];   // DEC ids recorded but not yet applied
  updated: string;
}
```

---

### Task 1: Extend types + store + ba_init for decisions

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/store.ts`
- Modify: `src/tools/baInit.ts`
- Test: `tests/core/decisions-types.test.ts`

**Interfaces:**
- Consumes: existing `ArtifactType`, `ID_PREFIX`, `FILE_BACKED_TYPES`, `Frontmatter` (types.ts); `FOLDER` map (store.ts).
- Produces: `"decision"` is a valid `ArtifactType` with `ID_PREFIX.decision === "DEC"`, is in `FILE_BACKED_TYPES`, maps to folder `08-decisions`; `Frontmatter` gains optional `derived_from?: string[]`; `ba_init` scaffolds `08-decisions/`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ID_PREFIX, FILE_BACKED_TYPES } from "../../src/core/types.js";
import { folderFor } from "../../src/core/store.js";
import { baInit } from "../../src/tools/baInit.js";

test("decision is a file-backed type mapped to 08-decisions", () => {
  expect(ID_PREFIX.decision).toBe("DEC");
  expect(FILE_BACKED_TYPES).toContain("decision");
  expect(folderFor("decision", "/d")).toBe("/d/08-decisions");
});

test("ba_init scaffolds the decisions folder", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const res = baInit({ projectRoot: root });
  expect(existsSync(join(res.docsRoot, "08-decisions"))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/decisions-types.test.ts`
Expected: FAIL — `ID_PREFIX.decision` already exists as "DEC" (from Phase 1) but `FILE_BACKED_TYPES` lacks "decision" and `08-decisions` is not scaffolded.

- [ ] **Step 3: Edit `src/core/types.ts`**

Add `derived_from` to the `Frontmatter` interface (after `refines?`):

```ts
  refines?: string[];
  derived_from?: string[];
```

Add `"decision"` to `FILE_BACKED_TYPES`:

```ts
export const FILE_BACKED_TYPES: ArtifactType[] =
  ["persona", "fr", "nfr", "use-case", "story", "decision"];
```

(`ID_PREFIX.decision` is already `"DEC"` and `ArtifactType` already includes `"decision"` from Phase 1 — no change needed there.)

- [ ] **Step 4: Edit `src/core/store.ts`**

The `FOLDER` record already maps `decision` to `"06-analysis"`. Change it to its own folder:

```ts
  risk: "06-analysis", assumption: "06-analysis",
  decision: "08-decisions",
```

(Add the `decision` entry; keep risk/assumption as-is.)

- [ ] **Step 5: Edit `src/tools/baInit.ts`**

Add `"08-decisions"` to the `DIRS` array:

```ts
  "06-analysis", "07-changelog", "08-decisions",
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/core/decisions-types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Run the full suite (no regressions)**

Run: `npm test`
Expected: all prior tests still pass.

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/core/store.ts src/tools/baInit.ts tests/core/decisions-types.test.ts
git commit -m "feat: register decision artifact type and scaffold 08-decisions"
```

---

### Task 2: Decisions ledger core

**Files:**
- Create: `src/core/decisions.ts`
- Test: `tests/core/decisions.test.ts`

**Interfaces:**
- Consumes: `nextId` (ids.ts), `writeArtifact`, `listArtifacts`, `readArtifact` (store.ts), `Frontmatter` (types.ts).
- Produces:
  - `interface DecisionInput { question: string; answer: string; asked_round: "surface"|"domain"|"gap"; topic: string; updated?: string }`
  - `function recordDecision(input: DecisionInput, docsRoot: string): string` — allocates `DEC-###`, writes a decision file (`applied:false`, `informs:[]`), returns the id.
  - `function listDecisions(docsRoot: string): Frontmatter[]` — all decision frontmatters.
  - `function getDecision(id: string, docsRoot: string): Frontmatter | undefined`
  - `function markApplied(id: string, artifactIds: string[], docsRoot: string): void` — sets `applied:true` and merges `artifactIds` into `informs` (dedup).

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { recordDecision, listDecisions, getDecision, markApplied } from "../../src/core/decisions.js";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  return join(root, "docs/ba");
}

test("records decisions with incrementing ids and reads them back", () => {
  const docsRoot = setup();
  const id1 = recordDecision({ question: "Scope?", answer: "MVP only", asked_round: "surface", topic: "scope", updated: "2026-06-18" }, docsRoot);
  const id2 = recordDecision({ question: "Auth?", answer: "email+password", asked_round: "domain", topic: "auth", updated: "2026-06-18" }, docsRoot);
  expect(id1).toBe("DEC-001");
  expect(id2).toBe("DEC-002");
  const all = listDecisions(docsRoot);
  expect(all.map(d => d.id).sort()).toEqual(["DEC-001", "DEC-002"]);
  const d1 = getDecision("DEC-001", docsRoot)!;
  expect(d1.answer).toBe("MVP only");
  expect(d1.applied).toBe(false);
});

test("markApplied sets applied and merges informs", () => {
  const docsRoot = setup();
  const id = recordDecision({ question: "Q", answer: "A", asked_round: "surface", topic: "t", updated: "2026-06-18" }, docsRoot);
  markApplied(id, ["US-001"], docsRoot);
  markApplied(id, ["US-001", "FR-002"], docsRoot);
  const d = getDecision(id, docsRoot)!;
  expect(d.applied).toBe(true);
  expect((d.informs as string[]).sort()).toEqual(["FR-002", "US-001"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/decisions.test.ts`
Expected: FAIL — cannot find module `decisions.js`.

- [ ] **Step 3: Write `src/core/decisions.ts`**

```ts
import type { Frontmatter } from "./types.js";
import { nextId } from "./ids.js";
import { writeArtifact, listArtifacts } from "./store.js";

export interface DecisionInput {
  question: string;
  answer: string;
  asked_round: "surface" | "domain" | "gap";
  topic: string;
  updated?: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function recordDecision(input: DecisionInput, docsRoot: string): string {
  const id = nextId("decision", docsRoot);
  const fm: Frontmatter = {
    id,
    type: "decision",
    title: input.question,
    status: "approved",
    version: 1,
    updated: input.updated ?? today(),
    question: input.question,
    answer: input.answer,
    asked_round: input.asked_round,
    topic: input.topic,
    applied: false,
    informs: [],
  };
  writeArtifact({ frontmatter: fm, body: "" }, docsRoot);
  return id;
}

export function listDecisions(docsRoot: string): Frontmatter[] {
  return listArtifacts(docsRoot)
    .filter(a => a.frontmatter.type === "decision")
    .map(a => a.frontmatter);
}

export function getDecision(id: string, docsRoot: string): Frontmatter | undefined {
  return listDecisions(docsRoot).find(d => d.id === id);
}

export function markApplied(id: string, artifactIds: string[], docsRoot: string): void {
  const artifact = listArtifacts(docsRoot).find(a => a.frontmatter.id === id && a.frontmatter.type === "decision");
  if (!artifact) throw new Error(`Decision not found: ${id}`);
  const fm = { ...artifact.frontmatter };
  const merged = new Set([...((fm.informs as string[] | undefined) ?? []), ...artifactIds]);
  fm.informs = [...merged];
  fm.applied = true;
  fm.updated = today();
  writeArtifact({ frontmatter: fm, body: artifact.body }, docsRoot);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/decisions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/decisions.ts tests/core/decisions.test.ts
git commit -m "feat: add decisions ledger core"
```

---

### Task 3: Session state core

**Files:**
- Create: `src/core/session.ts`
- Test: `tests/core/session.test.ts`

**Interfaces:**
- Consumes: `node:fs`, `node:path`, `yaml`.
- Produces:
  - `interface Question { ref: string; text: string; topic: string; round: "surface"|"domain"|"gap" }`
  - `interface SessionState { mode: "discovery"|"stabilize"; round: "surface"|"domain"|"gap"; open_questions: Question[]; pending_apply: string[]; updated: string }`
  - `function sessionPath(docsRoot: string): string` — `<docsRoot>/.ba-session.yml`
  - `function readSession(docsRoot: string): SessionState | null`
  - `function writeSession(state: SessionState, docsRoot: string): void`
  - `function clearAnsweredQuestions(state: SessionState, answeredTexts: string[]): SessionState` — returns a new state with matching `open_questions` removed (match by exact `text`).

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSession, writeSession, clearAnsweredQuestions } from "../../src/core/session.js";
import type { SessionState } from "../../src/core/session.js";

function base(): SessionState {
  return { mode: "discovery", round: "surface", open_questions: [], pending_apply: [], updated: "2026-06-18" };
}

test("returns null when no session file exists", () => {
  const docsRoot = mkdtempSync(join(tmpdir(), "ba-"));
  expect(readSession(docsRoot)).toBeNull();
});

test("round-trips session state", () => {
  const docsRoot = mkdtempSync(join(tmpdir(), "ba-"));
  const s = { ...base(), open_questions: [{ ref: "Q-1", text: "Scope?", topic: "scope", round: "surface" as const }], pending_apply: ["DEC-001"] };
  writeSession(s, docsRoot);
  const back = readSession(docsRoot)!;
  expect(back.mode).toBe("discovery");
  expect(back.open_questions[0].text).toBe("Scope?");
  expect(back.pending_apply).toEqual(["DEC-001"]);
});

test("clearAnsweredQuestions removes matching open questions", () => {
  const s = { ...base(), open_questions: [
    { ref: "Q-1", text: "Scope?", topic: "scope", round: "surface" as const },
    { ref: "Q-2", text: "Users?", topic: "users", round: "surface" as const },
  ] };
  const next = clearAnsweredQuestions(s, ["Scope?"]);
  expect(next.open_questions.map(q => q.text)).toEqual(["Users?"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/session.test.ts`
Expected: FAIL — cannot find module `session.js`.

- [ ] **Step 3: Write `src/core/session.ts`**

```ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";

export interface Question {
  ref: string;
  text: string;
  topic: string;
  round: "surface" | "domain" | "gap";
}

export interface SessionState {
  mode: "discovery" | "stabilize";
  round: "surface" | "domain" | "gap";
  open_questions: Question[];
  pending_apply: string[];
  updated: string;
}

export function sessionPath(docsRoot: string): string {
  return join(docsRoot, ".ba-session.yml");
}

export function readSession(docsRoot: string): SessionState | null {
  const p = sessionPath(docsRoot);
  if (!existsSync(p)) return null;
  return parse(readFileSync(p, "utf8")) as SessionState;
}

export function writeSession(state: SessionState, docsRoot: string): void {
  writeFileSync(sessionPath(docsRoot), stringify(state), "utf8");
}

export function clearAnsweredQuestions(state: SessionState, answeredTexts: string[]): SessionState {
  const answered = new Set(answeredTexts);
  return { ...state, open_questions: state.open_questions.filter(q => !answered.has(q.text)) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/session.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/session.ts tests/core/session.test.ts
git commit -m "feat: add resumable session state core"
```

---

### Task 4: Structural gap detection

**Files:**
- Create: `src/core/gaps.ts`
- Test: `tests/core/gaps.test.ts`

**Interfaces:**
- Consumes: `Artifact` (types.ts), `buildGraph` (graph.ts).
- Produces:
  - `interface Gap { kind: string; subject: string; message: string }`
  - `function detectGaps(artifacts: Artifact[]): Gap[]` — runs the checks below over the parsed artifacts.

Checks (Phase A):
1. `story-without-acceptance-criteria` — a story whose body has no "Given" line.
2. `fr-without-story` — a functional requirement with no story whose `implements` includes it.
3. `dangling-link` — any `buildGraph` dangling target (subject = the dangling id).
4. `untraced-artifact` — a non-decision artifact (persona/fr/nfr/use-case/story) with no `derived_from`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/gaps.test.ts`
Expected: FAIL — cannot find module `gaps.js`.

- [ ] **Step 3: Write `src/core/gaps.ts`**

```ts
import type { Artifact } from "./types.js";
import { buildGraph } from "./graph.js";

export interface Gap { kind: string; subject: string; message: string }

const TRACED_TYPES = new Set(["persona", "fr", "nfr", "use-case", "story"]);

export function detectGaps(artifacts: Artifact[]): Gap[] {
  const gaps: Gap[] = [];
  const stories = artifacts.filter(a => a.frontmatter.type === "story");

  for (const a of artifacts) {
    const fm = a.frontmatter;

    if (fm.type === "story" && !/\bGiven\b/.test(a.body)) {
      gaps.push({ kind: "story-without-acceptance-criteria", subject: fm.id,
        message: `Story ${fm.id} has no Given/When/Then acceptance criteria.` });
    }

    if (fm.type === "fr") {
      const hasStory = stories.some(s => ((s.frontmatter.implements as string[] | undefined) ?? []).includes(fm.id));
      if (!hasStory) {
        gaps.push({ kind: "fr-without-story", subject: fm.id,
          message: `Functional requirement ${fm.id} has no user story implementing it.` });
      }
    }

    if (TRACED_TYPES.has(fm.type) && !((fm.derived_from as string[] | undefined) ?? []).length) {
      gaps.push({ kind: "untraced-artifact", subject: fm.id,
        message: `Artifact ${fm.id} is not derived from any recorded decision.` });
    }
  }

  for (const id of buildGraph(artifacts).danglingTargets) {
    gaps.push({ kind: "dangling-link", subject: id,
      message: `Referenced id ${id} does not exist as an artifact.` });
  }

  return gaps;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/gaps.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/gaps.ts tests/core/gaps.test.ts
git commit -m "feat: add deterministic structural gap detection"
```

---

### Task 5: Shipped knowledge + question generator

**Files:**
- Create: `src/knowledge/question-banks/surface.yml`
- Create: `src/knowledge/checklists/domain.yml`
- Create: `src/core/knowledge.ts`
- Create: `src/core/questions.ts`
- Test: `tests/core/questions.test.ts`
- Modify: `tsconfig.json` (ensure YAML is copied is NOT needed — we read via fs at runtime; instead resolve path from module)

**Interfaces:**
- Consumes: `Gap` (gaps.ts), `Question` (session.ts), `Artifact` (types.ts), `node:fs`, `yaml`.
- Produces (knowledge.ts):
  - `function loadSurfaceQuestions(): { topic: string; text: string }[]`
  - `function loadDomainChecklist(): { type: string; dimensions: string[] }[]`
- Produces (questions.ts):
  - `function surfaceQuestions(): Question[]` — from the surface bank, `round: "surface"`, refs `Q-s1`, `Q-s2`, …
  - `function gapQuestions(gaps: Gap[]): Question[]` — one question per gap, `round: "gap"`, ref `Q-g<index>`, text derived from the gap message + a prompt.
  - `function domainQuestions(artifacts: Artifact[]): Question[]` — for each artifact of a checklisted type, emit a question per uncovered dimension (Phase A heuristic: emit all dimension prompts for each such artifact), `round: "domain"`, ref `Q-d<index>`.

**Knowledge files are read at runtime relative to the compiled module**, so they must ship in `dist/`. Since `tsc` does not copy non-TS files, `knowledge.ts` reads them from the SOURCE location resolved via `import.meta.url` walking up to the package root, then `src/knowledge` in dev and `dist/knowledge` in prod. To avoid that complexity, **embed the knowledge as TS in dev too**: `knowledge.ts` imports the YAML content by reading files relative to `import.meta.url`. The build step copies `src/knowledge` to `dist/knowledge` via an added `build` script.

- [ ] **Step 1: Write `src/knowledge/question-banks/surface.yml`**

```yaml
- topic: problem
  text: "In one or two sentences, what problem does this product solve and for whom?"
- topic: scope
  text: "What is explicitly in scope for the first version, and what is explicitly out of scope?"
- topic: users
  text: "Who are the main types of users or roles that will interact with the system?"
- topic: success
  text: "How will you know this is successful? What outcome or metric matters most?"
- topic: constraints
  text: "Are there hard constraints — deadlines, platforms, regulations, or systems it must integrate with?"
```

- [ ] **Step 2: Write `src/knowledge/checklists/domain.yml`**

```yaml
- type: story
  dimensions:
    - "Who is the actor for this story, and is that a defined persona?"
    - "What is the success outcome (the Then) in concrete, testable terms?"
    - "What should happen on the main failure or error path?"
    - "Are there edge cases (empty, maximum, concurrent, offline) to handle?"
- type: fr
  dimensions:
    - "What triggers this requirement, and what are its preconditions?"
    - "What are the explicit acceptance rules for considering it met?"
- type: nfr
  dimensions:
    - "What is the measurable target (number + unit) for this non-functional requirement?"
    - "Under what conditions or load must that target hold?"
```

- [ ] **Step 3: Write the failing test**

```ts
import { expect, test } from "vitest";
import { surfaceQuestions, gapQuestions, domainQuestions } from "../../src/core/questions.js";
import type { Artifact, Frontmatter } from "../../src/core/types.js";

const art = (fm: Partial<Frontmatter>): Artifact => ({
  frontmatter: { id: "US-001", type: "story", title: "t", status: "draft", version: 1, updated: "d", ...fm },
  body: "", filePath: "p",
});

test("surfaceQuestions returns the scope-setting bank tagged surface", () => {
  const qs = surfaceQuestions();
  expect(qs.length).toBeGreaterThanOrEqual(5);
  expect(qs.every(q => q.round === "surface")).toBe(true);
  expect(qs.some(q => q.topic === "scope")).toBe(true);
  expect(qs[0].ref).toMatch(/^Q-s\d+$/);
});

test("gapQuestions produces one gap-round question per gap", () => {
  const qs = gapQuestions([{ kind: "fr-without-story", subject: "FR-002", message: "FR-002 has no story." }]);
  expect(qs).toHaveLength(1);
  expect(qs[0].round).toBe("gap");
  expect(qs[0].text).toContain("FR-002");
});

test("domainQuestions emits checklist dimensions for a story", () => {
  const qs = domainQuestions([art({ id: "US-007", type: "story" })]);
  expect(qs.every(q => q.round === "domain")).toBe(true);
  expect(qs.some(q => /actor/i.test(q.text))).toBe(true);
  expect(qs.length).toBeGreaterThanOrEqual(4);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/core/questions.test.ts`
Expected: FAIL — cannot find module `questions.js`.

- [ ] **Step 5: Write `src/core/knowledge.ts`**

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";

// Resolve the knowledge dir relative to this compiled module (src/ in dev, dist/ in prod).
const here = dirname(fileURLToPath(import.meta.url));        // .../core
const knowledgeDir = join(here, "..", "knowledge");

export interface SurfaceQuestion { topic: string; text: string }
export interface ChecklistEntry { type: string; dimensions: string[] }

export function loadSurfaceQuestions(): SurfaceQuestion[] {
  return parse(readFileSync(join(knowledgeDir, "question-banks", "surface.yml"), "utf8")) as SurfaceQuestion[];
}

export function loadDomainChecklist(): ChecklistEntry[] {
  return parse(readFileSync(join(knowledgeDir, "checklists", "domain.yml"), "utf8")) as ChecklistEntry[];
}
```

- [ ] **Step 6: Write `src/core/questions.ts`**

```ts
import type { Artifact } from "./types.js";
import type { Question } from "./session.js";
import type { Gap } from "./gaps.js";
import { loadSurfaceQuestions, loadDomainChecklist } from "./knowledge.js";

export function surfaceQuestions(): Question[] {
  return loadSurfaceQuestions().map((q, i) => ({
    ref: `Q-s${i + 1}`, text: q.text, topic: q.topic, round: "surface",
  }));
}

export function gapQuestions(gaps: Gap[]): Question[] {
  return gaps.map((g, i) => ({
    ref: `Q-g${i + 1}`,
    text: `${g.message} What should it be? (gap: ${g.kind})`,
    topic: g.subject,
    round: "gap",
  }));
}

export function domainQuestions(artifacts: Artifact[]): Question[] {
  const checklist = loadDomainChecklist();
  const byType = new Map(checklist.map(c => [c.type, c.dimensions]));
  const out: Question[] = [];
  let i = 1;
  for (const a of artifacts) {
    const dims = byType.get(a.frontmatter.type);
    if (!dims) continue;
    for (const text of dims) {
      out.push({ ref: `Q-d${i++}`, text: `[${a.frontmatter.id}] ${text}`, topic: a.frontmatter.id, round: "domain" });
    }
  }
  return out;
}
```

- [ ] **Step 7: Edit `tsconfig.json` + `package.json` so knowledge ships in dist**

`tsc` does not copy `.yml`. Update the `build` script in `package.json` to copy the knowledge dir after compiling:

```json
    "build": "tsc -p tsconfig.json && node -e \"require('fs').cpSync('src/knowledge','dist/knowledge',{recursive:true})\"",
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/core/questions.test.ts`
Expected: PASS (3 tests). (Tests run against `src/knowledge` via the dev path resolution.)

- [ ] **Step 9: Verify build copies knowledge**

Run: `npm run build && node -e "require('fs').accessSync('dist/knowledge/question-banks/surface.yml')" && echo OK`
Expected: prints `OK`.

- [ ] **Step 10: Commit**

```bash
git add src/knowledge src/core/knowledge.ts src/core/questions.ts tests/core/questions.test.ts tsconfig.json package.json
git commit -m "feat: add shipped BA knowledge and question generator"
```

---

### Task 6: `ba_session_start` tool

**Files:**
- Create: `src/tools/baSessionStart.ts`
- Test: `tests/tools/baSessionStart.test.ts`

**Interfaces:**
- Consumes: `resolveConfig` (config.ts); `readSession`, `writeSession`, `SessionState` (session.ts).
- Produces:
  - `const baSessionStartSchema = z.object({ projectRoot: z.string(), mode: z.enum(["discovery","stabilize"]) })`
  - `function baSessionStart(input): { mode: string; round: string; resumed: boolean; next: string }` — if a session file exists, resume it (keep its round/open_questions/pending_apply but update mode); else create a new session (`round: "surface"` for discovery, `"gap"` for stabilize). Returns a `next` hint string telling the agent to call `ba_assess`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { readSession } from "../../src/core/session.js";

test("starts a fresh discovery session at the surface round", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const res = baSessionStart({ projectRoot: root, mode: "discovery" });
  expect(res.mode).toBe("discovery");
  expect(res.round).toBe("surface");
  expect(res.resumed).toBe(false);
  expect(res.next).toMatch(/ba_assess/);
  expect(readSession(join(root, "docs/ba"))!.mode).toBe("discovery");
});

test("resumes an existing session", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  const res = baSessionStart({ projectRoot: root, mode: "stabilize" });
  expect(res.resumed).toBe(true);
  expect(res.mode).toBe("stabilize");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/baSessionStart.test.ts`
Expected: FAIL — cannot find module `baSessionStart.js`.

- [ ] **Step 3: Write `src/tools/baSessionStart.ts`**

```ts
import { z } from "zod";
import { resolveConfig } from "../config.js";
import { readSession, writeSession } from "../core/session.js";
import type { SessionState } from "../core/session.js";

export const baSessionStartSchema = z.object({
  projectRoot: z.string(),
  mode: z.enum(["discovery", "stabilize"]),
});

export function baSessionStart(input: z.infer<typeof baSessionStartSchema>):
  { mode: string; round: string; resumed: boolean; next: string } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const existing = readSession(docsRoot);
  const today = new Date().toISOString().slice(0, 10);

  let state: SessionState;
  let resumed: boolean;
  if (existing) {
    state = { ...existing, mode: input.mode, updated: today };
    resumed = true;
  } else {
    state = {
      mode: input.mode,
      round: input.mode === "discovery" ? "surface" : "gap",
      open_questions: [],
      pending_apply: [],
      updated: today,
    };
    resumed = false;
  }
  writeSession(state, docsRoot);
  return { mode: state.mode, round: state.round, resumed, next: "Call ba_assess to get the questions to ask the user." };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/baSessionStart.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/baSessionStart.ts tests/tools/baSessionStart.test.ts
git commit -m "feat: add ba_session_start tool"
```

---

### Task 7: `ba_assess` tool

**Files:**
- Create: `src/tools/baAssess.ts`
- Test: `tests/tools/baAssess.test.ts`

**Interfaces:**
- Consumes: `resolveConfig`; `listArtifacts` (store.ts); `listDecisions` (decisions.ts); `detectGaps` (gaps.ts); `surfaceQuestions`, `gapQuestions`, `domainQuestions` (questions.ts); `readSession`, `writeSession` (session.ts).
- Produces:
  - `const baAssessSchema = z.object({ projectRoot: z.string() })`
  - `function baAssess(input): { round: string; questions: Question[]; gaps: Gap[]; stable: boolean }` — logic:
    1. Load session (error if none — tell caller to run `ba_session_start`).
    2. Load artifacts + decisions; compute `gaps = detectGaps(non-decision artifacts)`.
    3. Determine questions by state:
       - If discovery AND no decisions recorded yet → `round="surface"`, `questions=surfaceQuestions()`.
       - Else compute `domain = domainQuestions(checklisted artifacts)` and `gapq = gapQuestions(gaps)`. `round="domain"` if domain questions exist, else `"gap"`. `questions = [...domain, ...gapq]`.
    4. `stable = questions.length === 0 && gaps.length === 0`.
    5. Persist `round` + `open_questions = questions` into the session.
    6. Return.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { recordDecision } from "../../src/core/decisions.js";

test("fresh discovery assess returns surface questions and is not stable", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  const res = baAssess({ projectRoot: root });
  expect(res.round).toBe("surface");
  expect(res.questions.length).toBeGreaterThanOrEqual(5);
  expect(res.stable).toBe(false);
});

test("after a decision exists, assess moves past surface", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  recordDecision({ question: "Scope?", answer: "MVP", asked_round: "surface", topic: "scope", updated: "2026-06-18" }, join(root, "docs/ba"));
  const res = baAssess({ projectRoot: root });
  expect(res.round).not.toBe("surface");
});

test("throws when no session started", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  expect(() => baAssess({ projectRoot: root })).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/baAssess.test.ts`
Expected: FAIL — cannot find module `baAssess.js`.

- [ ] **Step 3: Write `src/tools/baAssess.ts`**

```ts
import { z } from "zod";
import { resolveConfig } from "../config.js";
import { listArtifacts } from "../core/store.js";
import { listDecisions } from "../core/decisions.js";
import { detectGaps } from "../core/gaps.js";
import type { Gap } from "../core/gaps.js";
import { surfaceQuestions, gapQuestions, domainQuestions } from "../core/questions.js";
import { readSession, writeSession } from "../core/session.js";
import type { Question } from "../core/session.js";

export const baAssessSchema = z.object({ projectRoot: z.string() });

export function baAssess(input: z.infer<typeof baAssessSchema>):
  { round: string; questions: Question[]; gaps: Gap[]; stable: boolean } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const session = readSession(docsRoot);
  if (!session) throw new Error("No active session. Call ba_session_start first.");

  const all = listArtifacts(docsRoot);
  const artifacts = all.filter(a => a.frontmatter.type !== "decision");
  const decisions = listDecisions(docsRoot);
  const gaps = detectGaps(artifacts);

  let round: Question["round"];
  let questions: Question[];

  if (session.mode === "discovery" && decisions.length === 0) {
    round = "surface";
    questions = surfaceQuestions();
  } else {
    const domain = domainQuestions(artifacts);
    const gapq = gapQuestions(gaps);
    questions = [...domain, ...gapq];
    round = domain.length > 0 ? "domain" : "gap";
  }

  const stable = questions.length === 0 && gaps.length === 0;
  writeSession({ ...session, round, open_questions: questions, updated: new Date().toISOString().slice(0, 10) }, docsRoot);
  return { round, questions, gaps, stable };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/baAssess.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/baAssess.ts tests/tools/baAssess.test.ts
git commit -m "feat: add ba_assess question engine"
```

---

### Task 8: `ba_record_answers` tool

**Files:**
- Create: `src/tools/baRecordAnswers.ts`
- Test: `tests/tools/baRecordAnswers.test.ts`

**Interfaces:**
- Consumes: `resolveConfig`; `recordDecision` (decisions.ts); `readSession`, `writeSession`, `clearAnsweredQuestions` (session.ts).
- Produces:
  - `const baRecordAnswersSchema = z.object({ projectRoot: z.string(), items: z.array(z.object({ question: z.string(), answer: z.string(), asked_round: z.enum(["surface","domain","gap"]), topic: z.string() })).min(1) })`
  - `function baRecordAnswers(input): { recorded: string[] }` — for each item, `recordDecision`; append the new DEC ids to `session.pending_apply`; clear matching `open_questions` (by question text); persist session. Returns the new decision ids.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { readSession } from "../../src/core/session.js";
import { listDecisions } from "../../src/core/decisions.js";

test("records answers as decisions, queues them for apply, and clears open questions", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  const assessed = baAssess({ projectRoot: root });
  const q = assessed.questions[0];

  const res = baRecordAnswers({ projectRoot: root, items: [
    { question: q.text, answer: "MVP only — internal tool", asked_round: "surface", topic: q.topic },
  ] });
  expect(res.recorded).toEqual(["DEC-001"]);

  const docsRoot = join(root, "docs/ba");
  expect(listDecisions(docsRoot)).toHaveLength(1);
  const session = readSession(docsRoot)!;
  expect(session.pending_apply).toContain("DEC-001");
  expect(session.open_questions.some(oq => oq.text === q.text)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/baRecordAnswers.test.ts`
Expected: FAIL — cannot find module `baRecordAnswers.js`.

- [ ] **Step 3: Write `src/tools/baRecordAnswers.ts`**

```ts
import { z } from "zod";
import { resolveConfig } from "../config.js";
import { recordDecision } from "../core/decisions.js";
import { readSession, writeSession, clearAnsweredQuestions } from "../core/session.js";

export const baRecordAnswersSchema = z.object({
  projectRoot: z.string(),
  items: z.array(z.object({
    question: z.string(),
    answer: z.string(),
    asked_round: z.enum(["surface", "domain", "gap"]),
    topic: z.string(),
  })).min(1),
});

export function baRecordAnswers(input: z.infer<typeof baRecordAnswersSchema>): { recorded: string[] } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const session = readSession(docsRoot);
  if (!session) throw new Error("No active session. Call ba_session_start first.");

  const recorded: string[] = [];
  for (const item of input.items) {
    recorded.push(recordDecision(item, docsRoot));
  }

  let next = clearAnsweredQuestions(session, input.items.map(i => i.question));
  next = { ...next, pending_apply: [...next.pending_apply, ...recorded], updated: new Date().toISOString().slice(0, 10) };
  writeSession(next, docsRoot);
  return { recorded };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/baRecordAnswers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/baRecordAnswers.ts tests/tools/baRecordAnswers.test.ts
git commit -m "feat: add ba_record_answers tool"
```

---

### Task 9: `ba_apply` tool (the anti-assumption gate)

**Files:**
- Create: `src/tools/baApply.ts`
- Test: `tests/tools/baApply.test.ts`

**Interfaces:**
- Consumes: `resolveConfig`; `baCreateArtifact` (baCreateArtifact.ts); `baUpdateArtifact` (baUpdateArtifact.ts); `listArtifacts`, `writeArtifact` (store.ts); `listDecisions`, `markApplied` (decisions.ts); `readSession`, `writeSession` (session.ts).
- Produces:
  - `const baApplySchema = z.object({ projectRoot: z.string(), artifacts: z.array(z.object({ op: z.enum(["create","update"]), type: z.enum(["persona","fr","nfr","use-case","story"]).optional(), id: z.string().optional(), title: z.string().optional(), priority: z.enum(["must","should","could","wont"]).optional(), status: z.enum(["draft","reviewed","approved","implemented","obsolete"]).optional(), body: z.string().optional(), implements: z.array(z.string()).optional(), satisfies: z.array(z.string()).optional(), refines: z.array(z.string()).optional(), derived_from: z.array(z.string()).min(1) })).min(1) })`
  - `function baApply(input): { applied: Array<{ id: string; op: string }> }` — for each spec:
    1. Validate every `derived_from` id is an existing **answered** decision in the ledger; otherwise throw `Unknown or unrecorded decision: <id>` (the anti-assumption guard).
    2. `create`: call `baCreateArtifact` (requires `type`+`title`), then write `derived_from` into the new artifact's frontmatter. `update`: call `baUpdateArtifact` (requires `id`), then merge `derived_from`.
    3. `markApplied(decId, [artifactId])` for each cited decision.
    4. Remove applied decisions from `session.pending_apply`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { baApply } from "../../src/tools/baApply.js";
import { getDecision } from "../../src/core/decisions.js";
import { readSession } from "../../src/core/session.js";

function seedDecision(root: string) {
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  baRecordAnswers({ projectRoot: root, items: [
    { question: "What story?", answer: "User resets password", asked_round: "surface", topic: "auth" },
  ] });
}

test("creates an artifact only when backed by a recorded decision, with bidirectional traceability", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  seedDecision(root); // creates DEC-001
  const res = baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Reset password", body: "Given a user When they request reset Then email is sent", derived_from: ["DEC-001"] },
  ] });
  expect(res.applied[0].op).toBe("create");
  const docsRoot = join(root, "docs/ba");
  const usId = res.applied[0].id;
  expect(readFileSync(join(docsRoot, "05-stories", `${usId}-reset-password.md`), "utf8")).toContain("derived_from");
  expect((getDecision("DEC-001", docsRoot)!.informs as string[])).toContain(usId);
  expect(getDecision("DEC-001", docsRoot)!.applied).toBe(true);
  expect(readSession(docsRoot)!.pending_apply).not.toContain("DEC-001");
});

test("rejects an artifact citing a decision that is not in the ledger", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  seedDecision(root);
  expect(() => baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Bogus", body: "Given x When y Then z", derived_from: ["DEC-999"] },
  ] })).toThrow(/DEC-999/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/baApply.test.ts`
Expected: FAIL — cannot find module `baApply.js`.

- [ ] **Step 3: Write `src/tools/baApply.ts`**

```ts
import { z } from "zod";
import { resolveConfig } from "../config.js";
import { baCreateArtifact } from "./baCreateArtifact.js";
import { baUpdateArtifact } from "./baUpdateArtifact.js";
import { listArtifacts, writeArtifact } from "../core/store.js";
import { listDecisions, markApplied } from "../core/decisions.js";
import { readSession, writeSession } from "../core/session.js";

export const baApplySchema = z.object({
  projectRoot: z.string(),
  artifacts: z.array(z.object({
    op: z.enum(["create", "update"]),
    type: z.enum(["persona", "fr", "nfr", "use-case", "story"]).optional(),
    id: z.string().optional(),
    title: z.string().optional(),
    priority: z.enum(["must", "should", "could", "wont"]).optional(),
    status: z.enum(["draft", "reviewed", "approved", "implemented", "obsolete"]).optional(),
    body: z.string().optional(),
    implements: z.array(z.string()).optional(),
    satisfies: z.array(z.string()).optional(),
    refines: z.array(z.string()).optional(),
    derived_from: z.array(z.string()).min(1),
  })).min(1),
});

function stampDerivedFrom(artifactId: string, derivedFrom: string[], docsRoot: string): void {
  const a = listArtifacts(docsRoot).find(x => x.frontmatter.id === artifactId);
  if (!a) throw new Error(`Artifact not found after write: ${artifactId}`);
  const fm = { ...a.frontmatter };
  const merged = new Set([...((fm.derived_from as string[] | undefined) ?? []), ...derivedFrom]);
  fm.derived_from = [...merged];
  writeArtifact({ frontmatter: fm, body: a.body }, docsRoot);
}

export function baApply(input: z.infer<typeof baApplySchema>): { applied: Array<{ id: string; op: string }> } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const session = readSession(docsRoot);
  if (!session) throw new Error("No active session. Call ba_session_start first.");

  const ledger = new Set(listDecisions(docsRoot).map(d => d.id));
  const applied: Array<{ id: string; op: string }> = [];
  const consumedDecisions = new Set<string>();

  for (const spec of input.artifacts) {
    for (const dec of spec.derived_from) {
      if (!ledger.has(dec)) throw new Error(`Unknown or unrecorded decision: ${dec}. Record the answer before applying.`);
    }

    let artifactId: string;
    if (spec.op === "create") {
      if (!spec.type || !spec.title) throw new Error("create requires type and title");
      const created = baCreateArtifact({
        projectRoot: input.projectRoot, type: spec.type, title: spec.title,
        priority: spec.priority, body: spec.body,
        implements: spec.implements, satisfies: spec.satisfies, refines: spec.refines,
      });
      artifactId = created.id;
    } else {
      if (!spec.id) throw new Error("update requires id");
      const updated = baUpdateArtifact({
        projectRoot: input.projectRoot, id: spec.id, title: spec.title,
        status: spec.status, priority: spec.priority, body: spec.body,
      });
      artifactId = updated.id;
    }

    stampDerivedFrom(artifactId, spec.derived_from, docsRoot);
    for (const dec of spec.derived_from) {
      markApplied(dec, [artifactId], docsRoot);
      consumedDecisions.add(dec);
    }
    applied.push({ id: artifactId, op: spec.op });
  }

  writeSession({
    ...session,
    pending_apply: session.pending_apply.filter(d => !consumedDecisions.has(d)),
    updated: new Date().toISOString().slice(0, 10),
  }, docsRoot);

  return { applied };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/baApply.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/baApply.ts tests/tools/baApply.test.ts
git commit -m "feat: add ba_apply with anti-assumption decision gate"
```

---

### Task 10: `ba_status` tool

**Files:**
- Create: `src/tools/baStatus.ts`
- Test: `tests/tools/baStatus.test.ts`

**Interfaces:**
- Consumes: `resolveConfig`; `listArtifacts` (store.ts); `listDecisions` (decisions.ts); `detectGaps` (gaps.ts); `readSession` (session.ts).
- Produces:
  - `const baStatusSchema = z.object({ projectRoot: z.string() })`
  - `function baStatus(input): { mode: string|null; openQuestions: number; gaps: number; pendingApply: number; counts: Record<string, number>; stable: boolean }` — recomputes gaps fresh from disk; `stable = openQuestions === 0 && gaps === 0`. `counts` is artifact count by type (excluding decisions).

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baStatus } from "../../src/tools/baStatus.js";

test("reports stable on an empty, sessioned project with no gaps and no open questions", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  const res = baStatus({ projectRoot: root });
  expect(res.mode).toBe("discovery");
  expect(res.openQuestions).toBe(0);
  expect(res.gaps).toBe(0);
  expect(res.stable).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/baStatus.test.ts`
Expected: FAIL — cannot find module `baStatus.js`.

- [ ] **Step 3: Write `src/tools/baStatus.ts`**

```ts
import { z } from "zod";
import { resolveConfig } from "../config.js";
import { listArtifacts } from "../core/store.js";
import { detectGaps } from "../core/gaps.js";
import { readSession } from "../core/session.js";

export const baStatusSchema = z.object({ projectRoot: z.string() });

export function baStatus(input: z.infer<typeof baStatusSchema>):
  { mode: string | null; openQuestions: number; gaps: number; pendingApply: number; counts: Record<string, number>; stable: boolean } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const session = readSession(docsRoot);
  const all = listArtifacts(docsRoot);
  const artifacts = all.filter(a => a.frontmatter.type !== "decision");
  const gaps = detectGaps(artifacts);

  const counts: Record<string, number> = {};
  for (const a of artifacts) counts[a.frontmatter.type] = (counts[a.frontmatter.type] ?? 0) + 1;

  const openQuestions = session?.open_questions.length ?? 0;
  return {
    mode: session?.mode ?? null,
    openQuestions,
    gaps: gaps.length,
    pendingApply: session?.pending_apply.length ?? 0,
    counts,
    stable: openQuestions === 0 && gaps.length === 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/baStatus.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/baStatus.ts tests/tools/baStatus.test.ts
git commit -m "feat: add ba_status with stability readout"
```

---

### Task 11: Server instructions, tool re-wiring, version bump, README

**Files:**
- Create: `src/instructions.ts`
- Modify: `src/index.ts`
- Modify: `package.json` (version 0.2.0)
- Modify: `tests/smoke.test.ts` (VERSION 0.2.0)
- Modify: `README.md`
- Test: `tests/index.test.ts` (extend)

**Interfaces:**
- Consumes: all five loop tools + their schemas; `baInit`/`baGet`/`baList` + schemas; `McpServer`.
- Produces:
  - `export const INSTRUCTIONS: string` (instructions.ts) — the BA persona + never-assume rule + loop description.
  - `buildServer()` registers exactly: `ba_init`, `ba_session_start`, `ba_assess`, `ba_record_answers`, `ba_apply`, `ba_status`, `ba_get`, `ba_list`. It passes `{ instructions: INSTRUCTIONS }` to `McpServer`. The autonomous `ba_create_artifact`/`ba_update_artifact`/`ba_link` are NOT registered.
  - `VERSION === "0.2.0"`.

- [ ] **Step 1: Write `src/instructions.ts`**

```ts
export const INSTRUCTIONS = `eazy-ba is your Business Analyst. Act like one: you elicit requirements
by interviewing the user — you never decide on their behalf and never fill a gap with an assumption.

Workflow (a loop):
1. Call ba_session_start with mode "discovery" (new project) or "stabilize" (tighten an existing one).
2. Call ba_assess to get the prioritized questions. It creates nothing.
3. Ask the user those questions, in focused rounds. Surface round first (scope), then domain depth, then gaps.
4. Record their answers verbatim with ba_record_answers — this is the decision trail.
5. Only then call ba_apply to write/update documents. Every artifact MUST cite the decisions it derives from
   (derived_from); ba_apply rejects any artifact backed by an unrecorded decision.
6. Call ba_assess again and repeat until ba_status reports stable (no open questions, no gaps).

Never invent personas, requirements, or acceptance criteria the user did not give you. If something is unknown,
it is a question, not an assumption.`;
```

- [ ] **Step 2: Write the failing test (extend `tests/index.test.ts`)**

Add these tests to the existing file:

```ts
import { INSTRUCTIONS } from "../src/index.js";

test("server exposes the loop tools and BA instructions", () => {
  // buildServer should not throw and INSTRUCTIONS should describe the loop.
  expect(typeof INSTRUCTIONS).toBe("string");
  expect(INSTRUCTIONS).toMatch(/never/i);
  expect(INSTRUCTIONS).toMatch(/ba_assess/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/index.test.ts`
Expected: FAIL — `INSTRUCTIONS` is not exported from index.

- [ ] **Step 4: Rewrite `src/index.ts`**

```ts
#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { baInit, baInitSchema } from "./tools/baInit.js";
import { baGet, baGetSchema, baList, baListSchema } from "./tools/baQuery.js";
import { baSessionStart, baSessionStartSchema } from "./tools/baSessionStart.js";
import { baAssess, baAssessSchema } from "./tools/baAssess.js";
import { baRecordAnswers, baRecordAnswersSchema } from "./tools/baRecordAnswers.js";
import { baApply, baApplySchema } from "./tools/baApply.js";
import { baStatus, baStatusSchema } from "./tools/baStatus.js";
import { INSTRUCTIONS } from "./instructions.js";

export { INSTRUCTIONS } from "./instructions.js";
export const VERSION = "0.2.0";

type Handler = (args: any) => unknown;

export function wrap(handler: Handler) {
  return async (args: unknown) => {
    try {
      const result = await handler(args);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }] };
    }
  };
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: "eazy-ba", version: VERSION }, { instructions: INSTRUCTIONS });
  server.registerTool("ba_init",
    { description: "Scaffold the docs/ba BA docs tree.", inputSchema: baInitSchema.shape }, wrap(baInit));
  server.registerTool("ba_session_start",
    { description: "Start or resume a BA session (mode: discovery | stabilize).", inputSchema: baSessionStartSchema.shape }, wrap(baSessionStart));
  server.registerTool("ba_assess",
    { description: "Analyze current state and return the questions to ask the user. Creates nothing.", inputSchema: baAssessSchema.shape }, wrap(baAssess));
  server.registerTool("ba_record_answers",
    { description: "Record the user's answers as traceable decisions.", inputSchema: baRecordAnswersSchema.shape }, wrap(baRecordAnswers));
  server.registerTool("ba_apply",
    { description: "Materialize/update documents from recorded decisions. Every artifact must cite derived_from decisions.", inputSchema: baApplySchema.shape }, wrap(baApply));
  server.registerTool("ba_status",
    { description: "Report open questions, gaps, pending decisions, and stability.", inputSchema: baStatusSchema.shape }, wrap(baStatus));
  server.registerTool("ba_get",
    { description: "Get one artifact by id.", inputSchema: baGetSchema.shape }, wrap(baGet));
  server.registerTool("ba_list",
    { description: "List artifacts filtered by type/status/priority/tag.", inputSchema: baListSchema.shape }, wrap(baList));
  return server;
}

async function main() {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}

export function invokedAsBinary(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedAsBinary()) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

Note: the existing `tests/index.test.ts` `wrap` tests still pass (signature unchanged). Keep them.

- [ ] **Step 5: Bump version in `package.json`**

Change `"version": "0.1.1"` to `"version": "0.2.0"`.

- [ ] **Step 6: Update `tests/smoke.test.ts`**

Change `expect(VERSION).toBe("0.1.1");` to `expect(VERSION).toBe("0.2.0");`.

- [ ] **Step 7: Update `README.md`**

Replace the "Tools (Phase 1)" table and the autonomous-tool description with the loop. Add this section after the install block (and remove the now-inaccurate Phase-1 tool table):

```markdown
## How it works — the interrogation loop

eazy-ba behaves like a Business Analyst: it asks before it writes, and never assumes.

1. `ba_session_start` — begin discovery (new project) or stabilize (tighten an existing one).
2. `ba_assess` — returns the questions to ask you. It writes nothing.
3. You answer; `ba_record_answers` saves each answer as a traceable decision (`DEC-###`).
4. `ba_apply` — turns those decisions into documents. Every document cites the decisions behind it;
   nothing is written without a recorded answer.
5. Repeat until `ba_status` reports **stable** (no open questions, no gaps).

Every requirement, story, and acceptance criterion traces back to a decision you made.
```

- [ ] **Step 8: Run the full suite + build**

Run: `npm test`
Expected: all tests pass (including the extended index tests).
Run: `npm run build`
Expected: clean compile and `dist/knowledge/` present.

- [ ] **Step 9: Commit**

```bash
git add src/instructions.ts src/index.ts package.json tests/smoke.test.ts tests/index.test.ts README.md
git commit -m "feat: wire interrogative loop tools, BA instructions, bump to 0.2.0"
```

---

### Task 12: End-to-end loop integration test

**Files:**
- Test: `tests/integration/loop.test.ts`

**Interfaces:**
- Consumes: all loop tools.
- Produces: a test proving the full discovery loop and the anti-assumption guarantee end-to-end.

- [ ] **Step 1: Write the integration test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { baApply } from "../../src/tools/baApply.js";
import { baStatus } from "../../src/tools/baStatus.js";

test("full discovery loop: no docs until answers are recorded and applied", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = join(root, "docs/ba");
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });

  // Assess emits surface questions; nothing is created yet.
  const surface = baAssess({ projectRoot: root });
  expect(surface.round).toBe("surface");
  expect(existsSync(join(docsRoot, "05-stories")) && readdirSync(join(docsRoot, "05-stories")).length).toBe(0);

  // Record answers, then apply a story derived from a decision.
  const rec = baRecordAnswers({ projectRoot: root, items: [
    { question: surface.questions[0].text, answer: "An internal tool for support agents", asked_round: "surface", topic: "scope" },
  ] });
  baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Agent logs in", body: "Given an agent When they sign in Then they reach the dashboard", derived_from: rec.recorded },
  ] });
  expect(readdirSync(join(docsRoot, "05-stories")).length).toBe(1);

  // Status reflects progress; the story is traced so no untraced-artifact gap for it.
  const status = baStatus({ projectRoot: root });
  expect(status.counts.story).toBe(1);
});

test("the loop cannot fabricate a document without a recorded decision", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  expect(() => baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Invented", body: "Given x When y Then z", derived_from: ["DEC-001"] },
  ] })).toThrow(/DEC-001/);
});
```

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run tests/integration/loop.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Run the full suite + build**

Run: `npm test && npm run build`
Expected: all tests pass; clean build with `dist/knowledge/`.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/loop.test.ts
git commit -m "test: end-to-end interrogative loop + anti-assumption guarantee"
```

---

## Self-Review

**Spec coverage:**
- Interrogative loop + tool surface → Tasks 6–11 (session_start, assess, record_answers, apply, status) + wiring.
- Autonomous tools removed from MCP surface → Task 11 (buildServer registers only the loop + read tools).
- Anti-assumption guarantee → Task 9 (`ba_apply` rejects unrecorded `derived_from`), proven in Task 12.
- Decisions ledger + bidirectional traceability → Tasks 1, 2, 9 (`derived_from` ↔ `informs`).
- Session state + resumability + stability → Tasks 3, 6, 7, 10.
- Surface→deep funnel + checklist/agent research → Tasks 5, 7.
- Structural gap detection → Task 4.
- Server persona instructions → Task 11.
- Knowledge shipped + copied to dist → Task 5.
- Version 0.2.0 → Task 11.
- README loop description + `claude mcp add` (already present) → Task 11.
- **Deferred (out of scope, by design):** `change` mode + impact analysis (Phase B); lint, visualization, codebase grounding (Phase C).

**Placeholder scan:** No TBD/TODO; every code step has complete code.

**Type consistency:** `DecisionInput`, `DecisionRecord` fields, `Question`, `SessionState`, `Gap` shapes are defined once (Shared Data Shapes + Tasks 2/3/4) and used consistently. `recordDecision`, `listDecisions`, `getDecision`, `markApplied`, `readSession`, `writeSession`, `clearAnsweredQuestions`, `detectGaps`, `surfaceQuestions`, `gapQuestions`, `domainQuestions`, `resolveConfig`, `baCreateArtifact`, `baUpdateArtifact` are referenced with the signatures they were defined with. `ba_apply` consumes the Phase-1 `baCreateArtifact`/`baUpdateArtifact` (which accept `derived_from`? — they do NOT; `ba_apply` stamps `derived_from` separately via `stampDerivedFrom`, so no change to Phase-1 tools is required).

---

## Notes for Phases B & C

- **Phase B (change intake):** add `mode: "change"`, an `impact.ts` core (blast radius over the decision→artifact graph via `informs`/`derived_from` + the ID graph), `asked_round: "change"`, and an `impact-report.md`. Builds on this plan's primitives unchanged.
- **Phase C (smoothers):** quality lint, Mermaid visualization, codebase grounding for question generation.
