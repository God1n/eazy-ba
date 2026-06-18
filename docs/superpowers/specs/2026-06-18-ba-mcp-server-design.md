# BA-MCP Server — Design Spec

**Date:** 2026-06-18
**Status:** Approved for planning
**Author:** pasindu

## Summary

A Model Context Protocol (MCP) server that acts as a **personal Business Analyst**
for a solo software engineer. It fills the BA role across the entire life of a
project: it drives requirement elicitation, pushes back with follow-up questions to
close gaps, runs gap and impact analysis as requirements change, and produces and
maintains a full set of BA artifacts (personas, requirements, use cases, user
stories, traceability, risks, assumptions) in a clean, git-friendly docs structure.

It is a **living BA system**, not a one-shot generator. Markdown files are the
single source of truth (markdown-as-database). The server reads and updates those
files, derives all analysis from them, and tracks change over time.

## Goals

- Be usable continuously throughout a project, absorbing changing requirements.
- Produce the full BA artifact set (level "C"): requirements, user stories with
  acceptance criteria, PRD/vision, personas, use cases, NFRs, glossary,
  requirements traceability matrix, assumptions log, risks log, and a standalone
  gap-analysis report.
- Make requirement gathering low-friction (intake from messy notes, guided
  elicitation).
- Apply real BA rigor automatically (quality linting, structural gap detection,
  shipped semantic checklists).
- Show the blast radius of a change before it is made.

## Non-Goals

- Not a project-management / ticketing tool (no sprint boards, time tracking).
- Not multi-project: it manages one project's BA docs per repo.
- Not a hosted service: it runs locally and is wired into a local agent
  (e.g. Claude Code).

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Artifact level | Full BA set ("C") | User wants full rigor incl. RTM, risks, assumptions, gap report |
| Source of truth | Markdown-as-database (Approach A) | Git-friendly, diffable, hand-editable, docs stay first-class |
| Gap analysis | Combined B + A | Deterministic structural gaps + shipped semantic checklists |
| Runtime | TypeScript + `@modelcontextprotocol/sdk` | Most mature MCP path, trivial Claude Code integration |
| Lifecycle | Living system w/ versioning + changelog | Requirements change throughout the project |

## Folder Architecture (managed docs)

Default root: `docs/ba/` (configurable via `_config.yml`). All files are markdown
with YAML frontmatter.

```
docs/ba/
├── _index.md                  # Project overview, status dashboard, links (generated)
├── _config.yml                # Doc root config: id prefixes, conventions, docs root
│
├── 01-vision/
│   ├── vision.md              # Problem, goals, success metrics
│   └── glossary.md            # Domain terms
│
├── 02-stakeholders/
│   └── personas/
│       ├── PER-001-end-user.md
│       └── PER-002-admin.md
│
├── 03-requirements/
│   ├── functional/
│   │   └── FR-001-account-login.md
│   └── non-functional/
│       └── NFR-001-performance.md
│
├── 04-use-cases/
│   └── UC-001-sign-in.md
│
├── 05-stories/
│   └── US-001-reset-password.md   # story + acceptance criteria (Gherkin)
│
├── 06-analysis/
│   ├── traceability.md            # auto-generated RTM
│   ├── gap-report.md              # latest gap analysis (B+A)
│   ├── assumptions.md             # assumptions log
│   └── risks.md                   # risks log
│
└── 07-changelog/
    └── CHANGELOG.md               # requirement change history over time
```

### Conventions

- **Stable IDs** (`FR-001`, `US-001`, `PER-001`, `NFR-001`, `UC-001`, `RSK-001`,
  `ASM-001`) are the backbone. Every artifact has one in frontmatter; cross-links
  use IDs.
- **One artifact per file** for clean diffs and focused hand-editing.
- **Frontmatter holds relationships** — RTM, gap report, and impact analysis are
  *derived*, never hand-maintained.
- Folders `06-analysis/` and `07-changelog/` plus `_index.md` are **fully
  generated**. The rest are co-authored (server + human).

## Data Model (frontmatter schema)

```yaml
---
id: US-001
type: story            # vision | glossary | persona | fr | nfr | use-case | story | risk | assumption
title: Reset password via email
status: draft          # draft | reviewed | approved | implemented | obsolete
priority: must         # MoSCoW: must | should | could | wont
implements: [FR-003]   # links to requirements
satisfies: [PER-001]   # links to personas
refines: [UC-002]      # links to use cases
tags: [auth]
version: 3
updated: 2026-06-18
---
## Story
As a <PER-001>, I want … so that …

## Acceptance Criteria   # Gherkin
- Given … When … Then …
```

The relationship edges (`implements` / `satisfies` / `refines`, and type-specific
links for risks/assumptions) form the dependency graph that powers traceability,
gap detection, and impact analysis. `version` + `07-changelog/` provide history.

## Tool Surface (MCP)

### Pillar 1 — Requirement Gathering
- `ba_init` — scaffold `docs/ba/` + `_config.yml` in the current project.
- `ba_create_artifact` — create persona / FR / NFR / use-case / story / risk /
  assumption. Allocates next stable ID, writes file with correct frontmatter +
  body template. For stories, auto-drafts Gherkin acceptance criteria.
- `ba_update_artifact` — edit fields/body of an existing artifact; bumps `version`,
  appends to changelog. Preserves hand-edited body + unknown frontmatter keys.
- `ba_link` — record a relationship between IDs in frontmatter.
- `ba_get` / `ba_list` — read one or query many (by type, status, priority, tag).

### Pillar 2 — Gap Analysis & Follow-up (B + A)
- `ba_analyze_gaps` — runs **deterministic structural checks** (story without
  acceptance criteria, FR with no story, persona referenced-but-undefined,
  dangling/orphaned IDs, untraceable items) **and** returns the **shipped semantic
  checklists** for the agent to apply. Writes `06-analysis/gap-report.md` and
  returns a structured gap list.
- `ba_followup_questions` — given the gap report (or a specific artifact), returns
  prioritized, ready-to-ask follow-up questions from the question bank + detected
  gaps.

### Pillar 3 — Documentation & Traceability (generated)
- `ba_build_traceability` — regenerate `traceability.md` (RTM:
  persona → FR/NFR → use case → story) from frontmatter.
- `ba_changelog` — append/query requirement change history.
- `ba_status` — regenerate `_index.md` dashboard (counts, coverage %, open gaps,
  MoSCoW/MVP slice).

### Enhancements (approved)
- `ba_ingest` — extract candidate requirements/stories from messy notes /
  transcript / idea, dedupe against existing artifacts, draft for review.
- `ba_elicit` — adaptive guided interview: selects the right framework for the
  current state (greenfield vs. feature add), asks the most information-dense next
  question, creates artifacts as answers arrive.
- `ba_lint` — flag ambiguity ("fast", "user-friendly", "etc.", "should probably"),
  untestable acceptance criteria, vague/passive actors, INVEST violations.
- `ba_impact` — compute downstream blast radius (affected use cases, stories, ACs)
  for a proposed change to a requirement, using the ID dependency graph.
- `ba_ground` — **opt-in** codebase grounding: scan the repo to suggest
  implicit/missing requirements and flag drift between docs and actual code. The
  only tool that reads outside `docs/ba/`.
- `ba_visualize` — generate Mermaid dependency-graph and user-story-map diagrams
  into the docs.

### Shipped knowledge (data, not code)
`src/knowledge/` ships editable YAML — this is where BA expertise lives and can be
tuned without code changes:
- `checklists/` — semantic gap checklists (e.g. INVEST, NFR category coverage,
  edge/error states).
- `question-banks/` — follow-up question templates.
- `templates/` — artifact body templates.

## Internal Architecture

```
src/
├── index.ts              # MCP server entry, tool registration
├── tools/                # one file per tool (thin handlers)
├── core/
│   ├── store.ts          # read/write/parse markdown+frontmatter (the "DB")
│   ├── ids.ts            # stable ID allocation
│   ├── graph.ts          # builds the relationship graph from frontmatter
│   ├── gaps.ts           # deterministic structural checks (Pillar B)
│   ├── lint.ts           # quality linting
│   ├── traceability.ts   # RTM generation
│   ├── impact.ts         # blast-radius computation
│   └── render.ts         # mermaid + dashboard generation
├── knowledge/            # shipped, editable YAML (BA expertise)
│   ├── checklists/
│   ├── question-banks/
│   └── templates/
└── config.ts             # resolve docs root, prefixes
```

- Each `core/` module is independently testable and depends only on `store.ts` +
  `graph.ts`.
- Tools are thin wrappers orchestrating core modules.
- `gaps`, `traceability`, `impact` are pure functions over parsed state.

## Error Handling

- **Validation:** every tool validates inputs with `zod`. Bad IDs, dangling links,
  and malformed frontmatter return clear structured errors — never silent
  corruption.
- **Tolerant reads:** warn (don't fail) on unknown frontmatter fields.
- **Safe writes:** preserve hand-edited body content and unknown frontmatter keys;
  never clobber human edits.
- **Determinism:** analysis tools are pure functions → reproducible output.

## Testing Strategy

- **Framework:** Vitest, TDD throughout.
- **Unit tests** per `core/` module against fixture doc trees.
- **Integration tests** driving tools end-to-end against a temp `docs/ba/`,
  asserting generated files (RTM, gap report, dashboard) match expectations.
- Golden-file tests for rendered outputs (traceability, mermaid, dashboard).

## Distribution

- Runnable via `npx` and wireable into Claude Code as an MCP server.
- Config resolves docs root from `_config.yml` or defaults to `docs/ba/` relative
  to the project working directory.
