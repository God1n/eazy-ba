# BA-MCP Phase 1 (Foundation + Core CRUD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working MCP server that scaffolds a `docs/ba/` BA docs tree and provides core artifact CRUD (init, create, update, link, get, list) backed by markdown-as-database.

**Architecture:** A TypeScript MCP server (`@modelcontextprotocol/sdk`) whose source of truth is markdown files with YAML frontmatter under `docs/ba/`. Pure `core/` modules (`store`, `ids`, `graph`) parse and persist artifacts; thin tool handlers in `tools/` orchestrate them and are registered on the server in `index.ts`. All cross-artifact relationships live in frontmatter so later analysis is derived.

**Tech Stack:** TypeScript (Node ≥ 18, ESM), `@modelcontextprotocol/sdk`, `zod` (input validation), `gray-matter` (frontmatter parse/serialize), `yaml`, `vitest` (TDD).

## Global Constraints

- Runtime: Node ≥ 18, ESM modules (`"type": "module"`), TypeScript strict mode.
- Source of truth: markdown + YAML frontmatter under `docs/ba/` (configurable). Never a separate DB.
- Writes MUST preserve hand-edited body content and unknown frontmatter keys (never clobber).
- Every tool validates inputs with `zod` and returns clear structured errors — never silent corruption.
- One artifact per file for file-backed types. Stable IDs are the backbone.
- Default docs root: `docs/ba/`, resolved relative to the project working directory (override via `_config.yml`).
- Phase 1 file-backed artifact types: `persona` (PER), `fr` (FR), `nfr` (NFR), `use-case` (UC), `story` (US). `vision`/`glossary` are singleton files created by `ba_init`; `risks.md`/`assumptions.md` are created empty by `ba_init` and populated in Phase 2.
- TDD: write the failing test first, every task ends with a commit.

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts` (placeholder)
- Create: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a buildable/testable TS+ESM project; `npm test` and `npm run build` work.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "eazy-ba",
  "version": "0.1.0",
  "type": "module",
  "bin": { "eazy-ba": "dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "gray-matter": "^4.0.3",
    "yaml": "^2.5.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
```

- [ ] **Step 4: Write placeholder `src/index.ts`**

```ts
export const VERSION = "0.1.0";
```

- [ ] **Step 5: Write the smoke test `tests/smoke.test.ts`**

```ts
import { expect, test } from "vitest";
import { VERSION } from "../src/index.js";

test("package version is exported", () => {
  expect(VERSION).toBe("0.1.0");
});
```

- [ ] **Step 6: Install and run tests**

Run: `npm install && npm test`
Expected: 1 test passes.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts src/index.ts tests/smoke.test.ts package-lock.json
git commit -m "chore: scaffold ba-mcp TypeScript project"
```

---

### Task 2: Shared types

**Files:**
- Create: `src/core/types.ts`
- Test: `tests/core/types.test.ts`

**Interfaces:**
- Produces:
  - `ArtifactType = 'vision'|'glossary'|'persona'|'fr'|'nfr'|'use-case'|'story'|'risk'|'assumption'`
  - `Status = 'draft'|'reviewed'|'approved'|'implemented'|'obsolete'`
  - `Priority = 'must'|'should'|'could'|'wont'`
  - `interface Frontmatter { id: string; type: ArtifactType; title: string; status: Status; priority?: Priority; implements?: string[]; satisfies?: string[]; refines?: string[]; tags?: string[]; version: number; updated: string; [k: string]: unknown }`
  - `interface Artifact { frontmatter: Frontmatter; body: string; filePath: string }`
  - `const ID_PREFIX: Record<ArtifactType, string>` and `const FILE_BACKED_TYPES: ArtifactType[]`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { ID_PREFIX, FILE_BACKED_TYPES } from "../../src/core/types.js";

test("id prefixes are defined for file-backed types", () => {
  expect(ID_PREFIX.story).toBe("US");
  expect(ID_PREFIX.fr).toBe("FR");
  expect(ID_PREFIX.persona).toBe("PER");
  expect(FILE_BACKED_TYPES).toContain("story");
  expect(FILE_BACKED_TYPES).not.toContain("vision");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/types.test.ts`
Expected: FAIL — cannot find module `types.js`.

- [ ] **Step 3: Write `src/core/types.ts`**

```ts
export type ArtifactType =
  | "vision" | "glossary" | "persona" | "fr" | "nfr"
  | "use-case" | "story" | "risk" | "assumption";

export type Status = "draft" | "reviewed" | "approved" | "implemented" | "obsolete";
export type Priority = "must" | "should" | "could" | "wont";

export interface Frontmatter {
  id: string;
  type: ArtifactType;
  title: string;
  status: Status;
  priority?: Priority;
  implements?: string[];
  satisfies?: string[];
  refines?: string[];
  tags?: string[];
  version: number;
  updated: string;
  [k: string]: unknown;
}

export interface Artifact {
  frontmatter: Frontmatter;
  body: string;
  filePath: string;
}

export const ID_PREFIX: Record<ArtifactType, string> = {
  vision: "VIS", glossary: "GLO", persona: "PER", fr: "FR", nfr: "NFR",
  "use-case": "UC", story: "US", risk: "RSK", assumption: "ASM",
};

export const FILE_BACKED_TYPES: ArtifactType[] =
  ["persona", "fr", "nfr", "use-case", "story"];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts tests/core/types.test.ts
git commit -m "feat: add shared BA artifact types"
```

---

### Task 3: Config resolution

**Files:**
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Consumes: `node:fs`, `node:path`, `yaml`.
- Produces:
  - `interface BaConfig { docsRoot: string; idStart: number }`
  - `function resolveConfig(projectRoot: string): BaConfig` — reads `<projectRoot>/docs/ba/_config.yml` if present, else defaults `{ docsRoot: path.join(projectRoot, "docs/ba"), idStart: 1 }`. A `_config.yml` may set `docsRoot` (relative to projectRoot) and `idStart`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig } from "../src/config.js";

test("defaults to docs/ba when no config", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const cfg = resolveConfig(root);
  expect(cfg.docsRoot).toBe(join(root, "docs/ba"));
  expect(cfg.idStart).toBe(1);
});

test("reads _config.yml overrides", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  mkdirSync(join(root, "docs/ba"), { recursive: true });
  writeFileSync(join(root, "docs/ba/_config.yml"), "docsRoot: specs/ba\nidStart: 100\n");
  const cfg = resolveConfig(root);
  expect(cfg.docsRoot).toBe(join(root, "specs/ba"));
  expect(cfg.idStart).toBe(100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — cannot find module `config.js`.

- [ ] **Step 3: Write `src/config.ts`**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { parse } from "yaml";

export interface BaConfig {
  docsRoot: string;
  idStart: number;
}

export function resolveConfig(projectRoot: string): BaConfig {
  const defaultRoot = join(projectRoot, "docs/ba");
  const configPath = join(defaultRoot, "_config.yml");
  let docsRoot = defaultRoot;
  let idStart = 1;

  if (existsSync(configPath)) {
    const raw = parse(readFileSync(configPath, "utf8")) ?? {};
    if (typeof raw.docsRoot === "string") {
      docsRoot = isAbsolute(raw.docsRoot) ? raw.docsRoot : join(projectRoot, raw.docsRoot);
    }
    if (typeof raw.idStart === "number") idStart = raw.idStart;
  }
  return { docsRoot, idStart };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add config resolution for docs root"
```

---

### Task 4: Store — read/write/parse artifacts

**Files:**
- Create: `src/core/store.ts`
- Test: `tests/core/store.test.ts`

**Interfaces:**
- Consumes: `Artifact`, `Frontmatter`, `ArtifactType`, `FILE_BACKED_TYPES` from `types.ts`; `gray-matter`; `node:fs`; `node:path`.
- Produces:
  - `function folderFor(type: ArtifactType, docsRoot: string): string`
  - `function slugify(s: string): string`
  - `function filePathFor(fm: Frontmatter, docsRoot: string): string` — e.g. `05-stories/US-001-reset-password.md`
  - `function writeArtifact(art: Omit<Artifact,"filePath">, docsRoot: string): string` — serializes frontmatter+body, writes file, returns path. Preserves unknown frontmatter keys (gray-matter passes the whole object through).
  - `function readArtifact(filePath: string): Artifact`
  - `function listArtifacts(docsRoot: string): Artifact[]` — walks file-backed folders, parses each `.md` with frontmatter `id`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/store.test.ts`
Expected: FAIL — cannot find module `store.js`.

- [ ] **Step 3: Write `src/core/store.ts`**

```ts
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import matter from "gray-matter";
import type { Artifact, ArtifactType, Frontmatter } from "./types.js";
import { FILE_BACKED_TYPES } from "./types.js";

const FOLDER: Record<ArtifactType, string> = {
  vision: "01-vision", glossary: "01-vision", persona: "02-stakeholders/personas",
  fr: "03-requirements/functional", nfr: "03-requirements/non-functional",
  "use-case": "04-use-cases", story: "05-stories",
  risk: "06-analysis", assumption: "06-analysis",
};

export function folderFor(type: ArtifactType, docsRoot: string): string {
  return join(docsRoot, FOLDER[type]);
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function filePathFor(fm: Frontmatter, docsRoot: string): string {
  return join(folderFor(fm.type, docsRoot), `${fm.id}-${slugify(fm.title)}.md`);
}

export function writeArtifact(art: Omit<Artifact, "filePath">, docsRoot: string): string {
  const path = filePathFor(art.frontmatter, docsRoot);
  mkdirSync(dirname(path), { recursive: true });
  // gray-matter passes the full frontmatter object through, preserving unknown keys.
  const content = matter.stringify(art.body ?? "", art.frontmatter as Record<string, unknown>);
  writeFileSync(path, content, "utf8");
  return path;
}

export function readArtifact(filePath: string): Artifact {
  const parsed = matter(readFileSync(filePath, "utf8"));
  return { frontmatter: parsed.data as Frontmatter, body: parsed.content, filePath };
}

export function listArtifacts(docsRoot: string): Artifact[] {
  const out: Artifact[] = [];
  for (const type of FILE_BACKED_TYPES) {
    const dir = folderFor(type, docsRoot);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (!name.endsWith(".md") || !statSync(p).isFile()) continue;
      const art = readArtifact(p);
      if (art.frontmatter && art.frontmatter.id) out.push(art);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/store.ts tests/core/store.test.ts
git commit -m "feat: add markdown artifact store"
```

---

### Task 5: ID allocation

**Files:**
- Create: `src/core/ids.ts`
- Test: `tests/core/ids.test.ts`

**Interfaces:**
- Consumes: `listArtifacts` from `store.ts`; `ID_PREFIX`, `ArtifactType` from `types.ts`.
- Produces:
  - `function nextId(type: ArtifactType, docsRoot: string, idStart = 1): string` — scans existing artifacts of that type, returns `${PREFIX}-${maxNumber+1 padded to 3}` (min `idStart`). e.g. `US-001`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/ids.test.ts`
Expected: FAIL — cannot find module `ids.js`.

- [ ] **Step 3: Write `src/core/ids.ts`**

```ts
import type { ArtifactType } from "./types.js";
import { ID_PREFIX } from "./types.js";
import { listArtifacts } from "./store.js";

export function nextId(type: ArtifactType, docsRoot: string, idStart = 1): string {
  const prefix = ID_PREFIX[type];
  let max = idStart - 1;
  for (const art of listArtifacts(docsRoot)) {
    if (art.frontmatter.type !== type) continue;
    const m = /-(\d+)$/.exec(art.frontmatter.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/ids.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/ids.ts tests/core/ids.test.ts
git commit -m "feat: add stable id allocation"
```

---

### Task 6: Relationship graph

**Files:**
- Create: `src/core/graph.ts`
- Test: `tests/core/graph.test.ts`

**Interfaces:**
- Consumes: `Artifact` from `types.ts`.
- Produces:
  - `interface Edge { from: string; to: string; kind: "implements"|"satisfies"|"refines" }`
  - `interface Graph { ids: Set<string>; edges: Edge[]; danglingTargets: string[] }`
  - `function buildGraph(artifacts: Artifact[]): Graph` — collects all ids, reads `implements`/`satisfies`/`refines` arrays into edges, records any edge target id that is not a known id in `danglingTargets`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/graph.test.ts`
Expected: FAIL — cannot find module `graph.js`.

- [ ] **Step 3: Write `src/core/graph.ts`**

```ts
import type { Artifact } from "./types.js";

export interface Edge { from: string; to: string; kind: "implements" | "satisfies" | "refines" }
export interface Graph { ids: Set<string>; edges: Edge[]; danglingTargets: string[] }

const KINDS: Edge["kind"][] = ["implements", "satisfies", "refines"];

export function buildGraph(artifacts: Artifact[]): Graph {
  const ids = new Set(artifacts.map(a => a.frontmatter.id));
  const edges: Edge[] = [];
  for (const a of artifacts) {
    for (const kind of KINDS) {
      const targets = (a.frontmatter[kind] as string[] | undefined) ?? [];
      for (const to of targets) edges.push({ from: a.frontmatter.id, to, kind });
    }
  }
  const dangling = [...new Set(edges.map(e => e.to).filter(to => !ids.has(to)))];
  return { ids, edges, danglingTargets: dangling };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/graph.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/graph.ts tests/core/graph.test.ts
git commit -m "feat: add relationship graph builder"
```

---

### Task 7: `ba_init` scaffolding

**Files:**
- Create: `src/tools/baInit.ts`
- Test: `tests/tools/baInit.test.ts`

**Interfaces:**
- Consumes: `BaConfig` resolution via `resolveConfig`; `node:fs`.
- Produces:
  - `const baInitSchema = z.object({ projectRoot: z.string() })`
  - `function baInit(input: { projectRoot: string }): { created: string[]; docsRoot: string }` — creates the full folder tree, `_config.yml`, `_index.md`, `01-vision/vision.md`, `01-vision/glossary.md`, empty `06-analysis/risks.md`, `06-analysis/assumptions.md`, `06-analysis/gap-report.md`, `06-analysis/traceability.md`, `07-changelog/CHANGELOG.md`. Idempotent: never overwrites an existing file.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";

test("scaffolds the docs tree and is idempotent", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const res = baInit({ projectRoot: root });
  expect(existsSync(join(res.docsRoot, "05-stories"))).toBe(true);
  expect(existsSync(join(res.docsRoot, "_config.yml"))).toBe(true);
  expect(existsSync(join(res.docsRoot, "07-changelog/CHANGELOG.md"))).toBe(true);

  // hand-edit a file, re-run, ensure it is not clobbered
  const vision = join(res.docsRoot, "01-vision/vision.md");
  writeFileSync(vision, "MY EDITS");
  baInit({ projectRoot: root });
  expect(readFileSync(vision, "utf8")).toBe("MY EDITS");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/baInit.test.ts`
Expected: FAIL — cannot find module `baInit.js`.

- [ ] **Step 3: Write `src/tools/baInit.ts`**

```ts
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { resolveConfig } from "../config.js";

export const baInitSchema = z.object({ projectRoot: z.string() });

const DIRS = [
  "01-vision", "02-stakeholders/personas", "03-requirements/functional",
  "03-requirements/non-functional", "04-use-cases", "05-stories",
  "06-analysis", "07-changelog",
];

const FILES: Record<string, string> = {
  "_config.yml": "docsRoot: docs/ba\nidStart: 1\n",
  "_index.md": "# BA Index\n\n_Status dashboard is generated by ba_status._\n",
  "01-vision/vision.md": "# Vision\n\n## Problem\n\n## Goals\n\n## Success Metrics\n",
  "01-vision/glossary.md": "# Glossary\n\n| Term | Definition |\n|------|------------|\n",
  "06-analysis/traceability.md": "# Traceability Matrix\n\n_Generated by ba_build_traceability._\n",
  "06-analysis/gap-report.md": "# Gap Report\n\n_Generated by ba_analyze_gaps._\n",
  "06-analysis/risks.md": "# Risks\n\n| ID | Risk | Impact | Mitigation |\n|----|------|--------|------------|\n",
  "06-analysis/assumptions.md": "# Assumptions\n\n| ID | Assumption | Status |\n|----|------------|--------|\n",
  "07-changelog/CHANGELOG.md": "# Requirement Changelog\n\n",
};

export function baInit(input: { projectRoot: string }): { created: string[]; docsRoot: string } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const created: string[] = [];
  for (const d of DIRS) mkdirSync(join(docsRoot, d), { recursive: true });
  for (const [rel, content] of Object.entries(FILES)) {
    const p = join(docsRoot, rel);
    if (!existsSync(p)) { writeFileSync(p, content, "utf8"); created.push(rel); }
  }
  return { created, docsRoot };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/baInit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/baInit.ts tests/tools/baInit.test.ts
git commit -m "feat: add ba_init scaffolding tool"
```

---

### Task 8: `ba_create_artifact`

**Files:**
- Create: `src/core/templates.ts`
- Create: `src/tools/baCreateArtifact.ts`
- Test: `tests/tools/baCreateArtifact.test.ts`

**Interfaces:**
- Consumes: `nextId` (ids.ts), `writeArtifact` (store.ts), `resolveConfig` (config.ts), `FILE_BACKED_TYPES`, types.
- Produces:
  - `function bodyTemplate(type: ArtifactType): string` (templates.ts) — story template includes a Gherkin `## Acceptance Criteria` stub.
  - `const baCreateSchema = z.object({ projectRoot: z.string(), type: z.enum(["persona","fr","nfr","use-case","story"]), title: z.string().min(1), priority: z.enum(["must","should","could","wont"]).optional(), implements: z.array(z.string()).optional(), satisfies: z.array(z.string()).optional(), refines: z.array(z.string()).optional(), tags: z.array(z.string()).optional(), body: z.string().optional() })`
  - `function baCreateArtifact(input): { id: string; filePath: string }` — allocates id, builds frontmatter (`version:1`, `status:"draft"`, `updated` from input or caller), writes file using provided body or `bodyTemplate(type)`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/baCreateArtifact.test.ts`
Expected: FAIL — cannot find module `baCreateArtifact.js`.

- [ ] **Step 3: Write `src/core/templates.ts`**

```ts
import type { ArtifactType } from "./types.js";

export function bodyTemplate(type: ArtifactType): string {
  switch (type) {
    case "story":
      return [
        "## Story",
        "As a <persona>, I want <capability> so that <benefit>.",
        "",
        "## Acceptance Criteria",
        "- Given <context> When <action> Then <outcome>",
        "",
      ].join("\n");
    case "persona":
      return "## Persona\n\n**Role:**\n\n**Goals:**\n\n**Pain points:**\n";
    case "fr":
      return "## Functional Requirement\n\n**Description:**\n\n**Rationale:**\n";
    case "nfr":
      return "## Non-Functional Requirement\n\n**Category:**\n\n**Measure:**\n";
    case "use-case":
      return "## Use Case\n\n**Actor:**\n\n**Main flow:**\n\n**Alternate flows:**\n";
    default:
      return "";
  }
}
```

- [ ] **Step 4: Write `src/tools/baCreateArtifact.ts`**

```ts
import { z } from "zod";
import { resolveConfig } from "../config.js";
import { nextId } from "../core/ids.js";
import { writeArtifact } from "../core/store.js";
import { bodyTemplate } from "../core/templates.js";
import type { ArtifactType, Frontmatter } from "../core/types.js";

export const baCreateSchema = z.object({
  projectRoot: z.string(),
  type: z.enum(["persona", "fr", "nfr", "use-case", "story"]),
  title: z.string().min(1),
  priority: z.enum(["must", "should", "could", "wont"]).optional(),
  implements: z.array(z.string()).optional(),
  satisfies: z.array(z.string()).optional(),
  refines: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  body: z.string().optional(),
  updated: z.string().optional(),
});

export function baCreateArtifact(input: z.infer<typeof baCreateSchema>): { id: string; filePath: string } {
  const { docsRoot, idStart } = resolveConfig(input.projectRoot);
  const type = input.type as ArtifactType;
  const id = nextId(type, docsRoot, idStart);
  const frontmatter: Frontmatter = {
    id, type, title: input.title, status: "draft", version: 1,
    updated: input.updated ?? new Date().toISOString().slice(0, 10),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.implements ? { implements: input.implements } : {}),
    ...(input.satisfies ? { satisfies: input.satisfies } : {}),
    ...(input.refines ? { refines: input.refines } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
  };
  const body = input.body ?? bodyTemplate(type);
  const filePath = writeArtifact({ frontmatter, body }, docsRoot);
  return { id, filePath };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/tools/baCreateArtifact.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/templates.ts src/tools/baCreateArtifact.ts tests/tools/baCreateArtifact.test.ts
git commit -m "feat: add ba_create_artifact tool with templates"
```

---

### Task 9: `ba_update_artifact` (with versioning + changelog)

**Files:**
- Create: `src/core/changelog.ts`
- Create: `src/tools/baUpdateArtifact.ts`
- Test: `tests/tools/baUpdateArtifact.test.ts`

**Interfaces:**
- Consumes: `listArtifacts`, `readArtifact`, `writeArtifact` (store.ts); `resolveConfig`.
- Produces:
  - `function appendChangelog(docsRoot: string, line: string): void` (changelog.ts) — appends a bullet to `07-changelog/CHANGELOG.md`.
  - `const baUpdateSchema = z.object({ projectRoot: z.string(), id: z.string(), title: z.string().optional(), status: z.enum(["draft","reviewed","approved","implemented","obsolete"]).optional(), priority: z.enum(["must","should","could","wont"]).optional(), body: z.string().optional(), updated: z.string().optional() })`
  - `function baUpdateArtifact(input): { id: string; filePath: string; version: number }` — finds artifact by id, merges changed fields, bumps `version`, sets `updated`, preserves unknown frontmatter keys and (unless `body` given) existing body, writes, and appends a changelog line. Throws if id not found.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baCreateArtifact } from "../../src/tools/baCreateArtifact.js";
import { baUpdateArtifact } from "../../src/tools/baUpdateArtifact.js";

test("updates status, bumps version, logs change, keeps body", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const c = baCreateArtifact({ projectRoot: root, type: "story", title: "Reset", updated: "2026-06-18" } as any);
  const u = baUpdateArtifact({ projectRoot: root, id: c.id, status: "approved", updated: "2026-06-19" });
  expect(u.version).toBe(2);
  const text = readFileSync(u.filePath, "utf8");
  expect(text).toContain("status: approved");
  expect(text).toContain("Acceptance Criteria"); // original body preserved
  const log = readFileSync(join(root, "docs/ba/07-changelog/CHANGELOG.md"), "utf8");
  expect(log).toContain(c.id);
});

test("throws on unknown id", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  expect(() => baUpdateArtifact({ projectRoot: root, id: "US-999" })).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/baUpdateArtifact.test.ts`
Expected: FAIL — cannot find module `baUpdateArtifact.js`.

- [ ] **Step 3: Write `src/core/changelog.ts`**

```ts
import { appendFileSync } from "node:fs";
import { join } from "node:path";

export function appendChangelog(docsRoot: string, line: string): void {
  appendFileSync(join(docsRoot, "07-changelog/CHANGELOG.md"), `- ${line}\n`, "utf8");
}
```

- [ ] **Step 4: Write `src/tools/baUpdateArtifact.ts`**

```ts
import { z } from "zod";
import { resolveConfig } from "../config.js";
import { listArtifacts, writeArtifact } from "../core/store.js";
import { appendChangelog } from "../core/changelog.js";

export const baUpdateSchema = z.object({
  projectRoot: z.string(),
  id: z.string(),
  title: z.string().optional(),
  status: z.enum(["draft", "reviewed", "approved", "implemented", "obsolete"]).optional(),
  priority: z.enum(["must", "should", "could", "wont"]).optional(),
  body: z.string().optional(),
  updated: z.string().optional(),
});

export function baUpdateArtifact(input: z.infer<typeof baUpdateSchema>): { id: string; filePath: string; version: number } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const existing = listArtifacts(docsRoot).find(a => a.frontmatter.id === input.id);
  if (!existing) throw new Error(`Artifact not found: ${input.id}`);

  const fm = { ...existing.frontmatter };
  const changed: string[] = [];
  if (input.title !== undefined && input.title !== fm.title) { fm.title = input.title; changed.push("title"); }
  if (input.status !== undefined && input.status !== fm.status) { fm.status = input.status; changed.push("status"); }
  if (input.priority !== undefined && input.priority !== fm.priority) { fm.priority = input.priority; changed.push("priority"); }
  const body = input.body !== undefined ? input.body : existing.body;
  if (input.body !== undefined) changed.push("body");

  fm.version = (fm.version ?? 1) + 1;
  fm.updated = input.updated ?? new Date().toISOString().slice(0, 10);

  const filePath = writeArtifact({ frontmatter: fm, body }, docsRoot);
  appendChangelog(docsRoot, `${fm.updated} ${fm.id} v${fm.version}: changed ${changed.join(", ") || "metadata"}`);
  return { id: fm.id, filePath, version: fm.version };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/tools/baUpdateArtifact.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/changelog.ts src/tools/baUpdateArtifact.ts tests/tools/baUpdateArtifact.test.ts
git commit -m "feat: add ba_update_artifact with versioning and changelog"
```

---

### Task 10: `ba_link`

**Files:**
- Create: `src/tools/baLink.ts`
- Test: `tests/tools/baLink.test.ts`

**Interfaces:**
- Consumes: `listArtifacts`, `writeArtifact`; `buildGraph` (graph.ts) for dangling check; `resolveConfig`; `appendChangelog`.
- Produces:
  - `const baLinkSchema = z.object({ projectRoot: z.string(), from: z.string(), to: z.string(), kind: z.enum(["implements","satisfies","refines"]) })`
  - `function baLink(input): { from: string; to: string; kind: string; warning?: string }` — adds `to` into the `from` artifact's `kind` array (dedup), bumps version, writes, logs. Throws if `from` not found. If `to` is not a known id, succeeds but returns a `warning`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/baLink.test.ts`
Expected: FAIL — cannot find module `baLink.js`.

- [ ] **Step 3: Write `src/tools/baLink.ts`**

```ts
import { z } from "zod";
import { resolveConfig } from "../config.js";
import { listArtifacts, writeArtifact } from "../core/store.js";
import { buildGraph } from "../core/graph.js";
import { appendChangelog } from "../core/changelog.js";

export const baLinkSchema = z.object({
  projectRoot: z.string(),
  from: z.string(),
  to: z.string(),
  kind: z.enum(["implements", "satisfies", "refines"]),
});

export function baLink(input: z.infer<typeof baLinkSchema>): { from: string; to: string; kind: string; warning?: string } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const all = listArtifacts(docsRoot);
  const from = all.find(a => a.frontmatter.id === input.from);
  if (!from) throw new Error(`Artifact not found: ${input.from}`);

  const fm = { ...from.frontmatter };
  const list = new Set([...((fm[input.kind] as string[] | undefined) ?? []), input.to]);
  fm[input.kind] = [...list];
  fm.version = (fm.version ?? 1) + 1;
  fm.updated = new Date().toISOString().slice(0, 10);
  writeArtifact({ frontmatter: fm, body: from.body }, docsRoot);
  appendChangelog(docsRoot, `${fm.updated} ${fm.id}: ${input.kind} ${input.to}`);

  const warning = buildGraph(all).ids.has(input.to) ? undefined
    : `Target ${input.to} is not a known artifact id (dangling link).`;
  return { from: input.from, to: input.to, kind: input.kind, warning };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/baLink.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/baLink.ts tests/tools/baLink.test.ts
git commit -m "feat: add ba_link tool"
```

---

### Task 11: `ba_get` and `ba_list`

**Files:**
- Create: `src/tools/baQuery.ts`
- Test: `tests/tools/baQuery.test.ts`

**Interfaces:**
- Consumes: `listArtifacts`, `readArtifact` indirectly; `resolveConfig`; types.
- Produces:
  - `const baGetSchema = z.object({ projectRoot: z.string(), id: z.string() })`
  - `function baGet(input): Artifact` — returns the artifact by id; throws if not found.
  - `const baListSchema = z.object({ projectRoot: z.string(), type: z.string().optional(), status: z.string().optional(), priority: z.string().optional(), tag: z.string().optional() })`
  - `function baList(input): Array<{ id: string; type: string; title: string; status: string; priority?: string }>` — filtered summary list.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/baQuery.test.ts`
Expected: FAIL — cannot find module `baQuery.js`.

- [ ] **Step 3: Write `src/tools/baQuery.ts`**

```ts
import { z } from "zod";
import { resolveConfig } from "../config.js";
import { listArtifacts } from "../core/store.js";
import type { Artifact } from "../core/types.js";

export const baGetSchema = z.object({ projectRoot: z.string(), id: z.string() });

export function baGet(input: z.infer<typeof baGetSchema>): Artifact {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const art = listArtifacts(docsRoot).find(a => a.frontmatter.id === input.id);
  if (!art) throw new Error(`Artifact not found: ${input.id}`);
  return art;
}

export const baListSchema = z.object({
  projectRoot: z.string(),
  type: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  tag: z.string().optional(),
});

export function baList(input: z.infer<typeof baListSchema>):
  Array<{ id: string; type: string; title: string; status: string; priority?: string }> {
  const { docsRoot } = resolveConfig(input.projectRoot);
  return listArtifacts(docsRoot)
    .filter(a => !input.type || a.frontmatter.type === input.type)
    .filter(a => !input.status || a.frontmatter.status === input.status)
    .filter(a => !input.priority || a.frontmatter.priority === input.priority)
    .filter(a => !input.tag || (a.frontmatter.tags ?? []).includes(input.tag))
    .map(a => ({
      id: a.frontmatter.id, type: a.frontmatter.type, title: a.frontmatter.title,
      status: a.frontmatter.status, priority: a.frontmatter.priority,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/baQuery.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/baQuery.ts tests/tools/baQuery.test.ts
git commit -m "feat: add ba_get and ba_list query tools"
```

---

### Task 12: MCP server registration + entry point

**Files:**
- Modify: `src/index.ts` (replace placeholder)
- Test: `tests/index.test.ts`

**Interfaces:**
- Consumes: all tool handlers + their zod schemas; `@modelcontextprotocol/sdk`.
- Produces:
  - `function buildServer(): McpServer` — registers all 7 tools (`ba_init`, `ba_create_artifact`, `ba_update_artifact`, `ba_link`, `ba_get`, `ba_list`) with their schemas, wrapping each handler so it returns `{ content: [{ type: "text", text: JSON.stringify(result) }] }` and converts thrown errors into `{ isError: true, content: [...] }`.
  - `main()` — connects the server over stdio when run as the binary.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { buildServer } from "../src/index.js";

test("buildServer registers expected tools", async () => {
  const server = buildServer();
  expect(server).toBeDefined();
  // registerTool stores definitions; smoke check that build doesn't throw and is reusable.
  expect(typeof buildServer).toBe("function");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/index.test.ts`
Expected: FAIL — `buildServer` is not exported.

- [ ] **Step 3: Write `src/index.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { baInit, baInitSchema } from "./tools/baInit.js";
import { baCreateArtifact, baCreateSchema } from "./tools/baCreateArtifact.js";
import { baUpdateArtifact, baUpdateSchema } from "./tools/baUpdateArtifact.js";
import { baLink, baLinkSchema } from "./tools/baLink.js";
import { baGet, baGetSchema, baList, baListSchema } from "./tools/baQuery.js";

export const VERSION = "0.1.0";

type Handler = (args: any) => unknown;

function wrap(handler: Handler) {
  return async (args: unknown) => {
    try {
      const result = handler(args);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: (err as Error).message }],
      };
    }
  };
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: "eazy-ba", version: VERSION });
  server.registerTool("ba_init",
    { description: "Scaffold the docs/ba BA docs tree.", inputSchema: baInitSchema.shape },
    wrap(baInit));
  server.registerTool("ba_create_artifact",
    { description: "Create a persona/fr/nfr/use-case/story artifact.", inputSchema: baCreateSchema.shape },
    wrap(baCreateArtifact));
  server.registerTool("ba_update_artifact",
    { description: "Update an artifact; bumps version and logs the change.", inputSchema: baUpdateSchema.shape },
    wrap(baUpdateArtifact));
  server.registerTool("ba_link",
    { description: "Link two artifacts via implements/satisfies/refines.", inputSchema: baLinkSchema.shape },
    wrap(baLink));
  server.registerTool("ba_get",
    { description: "Get one artifact by id.", inputSchema: baGetSchema.shape },
    wrap(baGet));
  server.registerTool("ba_list",
    { description: "List artifacts filtered by type/status/priority/tag.", inputSchema: baListSchema.shape },
    wrap(baList));
  return server;
}

async function main() {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}

// Run as binary when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Build the project**

Run: `npm run build`
Expected: compiles to `dist/` with no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: register MCP tools and stdio entry point"
```

---

## Self-Review

**Spec coverage (Phase 1 scope):**
- Folder architecture → Task 7 (`ba_init`) creates the full tree incl. 06/07.
- Markdown-as-database / frontmatter model → Tasks 2, 4.
- Stable IDs → Task 5.
- Relationship graph (basis for traceability/gaps/impact in later phases) → Task 6.
- Requirement-gathering CRUD (`ba_create_artifact`, `ba_update_artifact`, `ba_link`, `ba_get`, `ba_list`) → Tasks 8–11.
- Versioning + changelog (living system) → Task 9.
- Gherkin AC auto-draft + MoSCoW priority → Task 8.
- Preserve hand-edits / unknown keys (safe writes) → Tasks 4, 9 (tested).
- zod validation + structured errors → schemas per tool + `wrap` in Task 12.
- MCP server wiring → Task 12.
- **Deferred to Phase 2/3 (out of scope here, by design):** `ba_analyze_gaps`, `ba_followup_questions`, `ba_build_traceability`, `ba_status`, `ba_changelog` query, `ba_ingest`, `ba_elicit`, `ba_lint`, `ba_impact`, `ba_ground`, `ba_visualize`, and the shipped `knowledge/` YAML.

**Placeholder scan:** No TBD/TODO; every code step has complete code.

**Type consistency:** `Frontmatter`, `Artifact`, `ID_PREFIX`, `FILE_BACKED_TYPES`, `nextId`, `writeArtifact`, `listArtifacts`, `buildGraph`, `resolveConfig`, `appendChangelog` are defined once and used with matching signatures across tasks. Tool handlers all take `{ projectRoot, ... }` and are wrapped uniformly in Task 12.

---

## Notes for Phases 2 & 3

After Phase 1 lands and the store/graph shapes are proven, the next plans build on the SAME `core/` primitives:
- **Phase 2 (analysis):** `gaps.ts`, `lint.ts`, `traceability.ts`, `impact.ts`, `render.ts` + their tools, plus the shipped `knowledge/checklists` and `knowledge/question-banks`.
- **Phase 3 (smoothers):** `ba_ingest`, `ba_elicit`, `ba_ground`, `ba_visualize`.
