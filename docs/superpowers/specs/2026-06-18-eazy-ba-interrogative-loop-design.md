# eazy-ba Interrogative Loop — Design Spec (Phase A)

**Date:** 2026-06-18
**Status:** Approved for planning
**Author:** pasindu
**Builds on:** Phase 1 foundation (eazy-ba 0.1.1)

## Summary

Invert eazy-ba's interaction model. Today the agent makes BA decisions and
assumptions on the user's behalf and writes documents autonomously. Instead,
eazy-ba must behave like a real Business Analyst: **interrogate the user before
every decision, record the answers, and only then write or update documents.**
A real BA cannot make the client's decisions — every gap becomes a question for
the client, never an assumption.

All three real-world situations the user described collapse into **one loop**
entered from different points:

- **Situation 1 — Greenfield discovery:** short big-picture from the client → a
  *surface question round* to establish scope → the BA researches the domain →
  a *deep follow-up round* to cover the whole domain → write all documents from
  the recorded answers. Thorough, possibly long, but correct.
- **Situation 2 — Mid-development change:** the client describes a change → the
  BA computes impact / feasibility / likelihood → follow-up questions to fill
  gaps → update documents.
- **Situation 3 — Stabilize:** after either, run gap analysis → follow-up
  questions for the gaps → update documents → **repeat until stable** (no open
  gaps and no unanswered questions).

The common engine: **analyze current state → generate follow-up questions →
user answers → record decisions → update docs → re-analyze → loop until stable.**

This spec covers **Phase A**: the discovery loop (Situation 1) and the
gap-sweep loop (Situation 3) for greenfield, plus the decisions ledger,
traceability, session state, and the enforcement model. Situation 2 (change
intake) is **Phase B**; smoothers (lint, visualizations, codebase grounding)
are **Phase C**. Each later phase gets its own brainstorm → plan → build cycle.

Ships as **eazy-ba 0.2.0** (behavioral change: the loop replaces the autonomous
create/update/link tools on the public surface).

## Goals

- The agent's only path to writing a document is: ask the user → record the
  answer → apply. It cannot create or change an artifact from an unrecorded
  assumption.
- Every question-and-answer is recorded as a first-class decision with a stable
  ID, and every artifact traces back to the decisions that justify it
  (bidirectional).
- Greenfield discovery runs as a surface→deep funnel; the deep round is
  generated from shipped BA checklists tailored by the agent's domain knowledge.
- The loop knows when to stop: "stable" = no open questions and no unanswered
  structural gaps.
- Sessions resume across conversations.

## Non-Goals (Phase A)

- Change-intake / impact analysis (Situation 2) — that is Phase B.
- Quality linting, Mermaid visualizations, codebase grounding — Phase C.
- The server never talks to the user directly. It emits questions as tool
  output; the host agent (Claude) relays them and writes answers back via a
  tool. No reliance on any MCP client "elicitation" feature.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Interaction model | Question-first loop | A BA interrogates; never decides for the client |
| Decision recording | Decisions ledger + bidirectional traceability ("A") | The decision trail is the BA's core value; makes Phase B impact analysis precise |
| Research for deep round | Shipped checklists + agent domain knowledge; codebase grounding deferred to Phase C | Guarantees BA-fundamental coverage, tailored to the domain, works offline |
| Enforcement | Hybrid: workflow-gated tools + persona server instructions | Instructions alone are easy to shortcut; tools alone can't phrase/prioritize questions |
| Scope | Phase A only (discovery + stabilize loops) | Large redesign; ship a complete usable slice first |
| Version | 0.2.0 | Behavioral change to the public tool surface |

## Interaction Model & Public Tool Surface

The public MCP surface changes from "do-it" tools to **loop** tools. The Phase-1
autonomous tools `ba_create_artifact`, `ba_update_artifact`, and `ba_link` are
**removed from the MCP surface** and become internal functions that only
`ba_apply` calls. This is the structural anti-assumption guarantee.

- **`ba_session_start(mode)`** — `mode: discovery | stabilize` (Phase A;
  `change` arrives in Phase B). Opens or resumes a session; returns the current
  state summary and the next step. `discovery` begins the surface→deep funnel;
  `stabilize` jumps straight to the gap sweep.
- **`ba_assess`** — the analysis brain. Reads current state for the active mode
  and returns **prioritized questions**. *Creates nothing.* In discovery it
  emits the surface round first; after those answers are recorded, it emits the
  domain-deep round built from shipped checklists + the agent's domain
  knowledge. In stabilize it runs structural gap detection and emits a question
  per open gap.
- **`ba_record_answers(items)`** — appends each Q&A to the decisions ledger as
  `DEC-###`, tagged with round + topic. Updates session state (clears the
  matching open questions, adds the new decisions to `pending_apply`).
- **`ba_apply`** — materializes/updates artifacts from
  **recorded-but-unapplied** decisions (`pending_apply`), stamping
  `derived_from: [DEC-###]` on artifacts and `informs: [<artifact-id>]` on the
  decisions. It can only act on decisions that exist in the ledger; a reference
  to a non-existent decision is an error.
- **`ba_status`** — dashboard: open questions, unanswered structural gaps,
  pending vs applied decisions, and the **stability** readout (stable = no open
  questions AND no unanswered gaps).
- **`ba_init`**, **`ba_get`**, **`ba_list`** — retained from Phase 1.

The agent's loop: `ba_session_start` → `ba_assess` → (ask the user in chat) →
`ba_record_answers` → `ba_apply` → `ba_assess` again → … until `ba_status`
reports stable.

### Server instructions (the persona)

The server provides MCP instructions establishing the BA persona and the hard
rules: you are a Business Analyst; you never decide for the client; every gap or
ambiguity becomes a question; you ask in focused rounds, record answers before
writing, and you keep looping `ba_assess` until stable. These set the tone and
the judgment (which questions matter, how to phrase them) that the gated tools
cannot encode.

## Data Model

All additions live under `docs/ba/`, markdown + YAML frontmatter, hand-editable.

### Decisions ledger — `08-decisions/DEC-001-*.md` (one file per decision)

```yaml
---
id: DEC-014
type: decision
question: "What happens when the password reset email fails to send?"
answer: "Show a retry option and log the failure; don't block the user."
asked_round: domain        # surface | domain | gap   (change added in Phase B)
topic: auth                # free tag for grouping
applied: true              # has ba_apply materialized this yet?
informs: [US-007, FR-003]  # artifacts this decision produced or changed
created: 2026-06-18
---
```

`type: decision` is added to the artifact type set; `DEC` is its ID prefix.
Decisions are file-backed and IDed like any other artifact.

### Artifact traceability (extends Phase-1 frontmatter)

Artifacts gain an optional `derived_from: [DEC-###]` list. Combined with the
decision's `informs`, traceability is bidirectional and derived from
frontmatter (no separate index to maintain).

### Session state — `.ba-session.yml` (single file, the loop's working memory)

```yaml
mode: discovery
round: domain              # surface | domain | gap
open_questions:            # asked, not yet answered
  - { ref: Q-31, text: "...", topic: auth }
pending_apply: [DEC-014, DEC-015]   # recorded, not yet materialized
updated: 2026-06-18
```

Survives across conversations so a session resumes. `ba_status` always
recomputes stability from disk (open_questions + a fresh gap assessment), never
trusting stale state alone.

### Gap reports — reuse `06-analysis/`

`ba_assess` (stabilize) regenerates `06-analysis/gap-report.md`. (Phase B adds
`impact-report.md`.)

## Architecture

Reuses the Phase-1 `core/` modules (`store`, `ids`, `graph`, `changelog`,
`templates`, `config`) unchanged. Adds:

```
src/
├── core/
│   ├── decisions.ts     # decisions-ledger read/write; applied/pending queries
│   ├── session.ts       # .ba-session.yml read/write + stability computation
│   ├── gaps.ts          # deterministic structural gap detection
│   └── questions.ts     # turn gaps + checklists into prioritized questions
├── knowledge/           # shipped, editable YAML (the BA expertise)
│   ├── checklists/      # per-type coverage dimensions
│   └── question-banks/  # surface-round + domain-round question templates
├── tools/
│   ├── baSessionStart.ts
│   ├── baAssess.ts
│   ├── baRecordAnswers.ts
│   ├── baApply.ts
│   └── baStatus.ts
└── instructions.ts      # server persona + "never assume" instruction string
```

`ba_apply` calls the existing create/update/link functions (now internal,
unexported from the MCP surface but still unit-tested). Each new `core/` module
is pure and independently testable, consistent with Phase 1.

### Structural gap detection (Phase A scope)

Deterministic checks over the parsed artifact graph, e.g.:
- a story with no acceptance criteria,
- a functional requirement with no story implementing it,
- a persona referenced (`satisfies`) but undefined,
- dangling/orphaned IDs (from `buildGraph`),
- an artifact with no `derived_from` decision (untraced),
- required vision/scope fields still empty.

Each gap maps to a question template in the question bank. Semantic coverage
(the deep domain round) comes from the checklists applied by the agent.

## Error Handling

- zod validation on every tool input.
- `ba_apply` errors clearly if a decision reference is not in the ledger — this
  is the anti-assumption guard, surfaced through the existing `isError` wrapper.
- `ba_apply` is idempotent: it processes only `pending_apply`; re-running is a
  no-op for already-applied decisions.
- `ba_record_answers` dedups by question `ref`.
- Tolerant reads / safe writes carry over from Phase 1 (unknown frontmatter
  keys and hand-edited bodies preserved).

## Testing Strategy

- Vitest, TDD throughout.
- Unit tests per new `core/` module: `gaps` (each gap type on fixtures),
  `questions` (gaps + checklists → prioritized questions), `decisions`
  (ledger write/read, pending/applied queries, bidirectional links),
  `session` (state round-trip, stability computation).
- Integration test driving a full discovery loop end-to-end on a temp
  `docs/ba/`: assert (1) no artifact exists until answers are recorded and
  `ba_apply` runs; (2) `ba_apply` refuses a decision id not in the ledger;
  (3) `derived_from`/`informs` links are bidirectional; (4) `ba_status` reports
  unstable while gaps remain and stable once answered.
- Golden-file test for the generated `gap-report.md`.

## Migration / Compatibility

- Removing the autonomous create/update/link tools from the public surface is a
  breaking behavioral change → minor bump to **0.2.0** (pre-1.0 semantics).
- Phase-1 docs trees remain readable; new `08-decisions/` and `.ba-session.yml`
  are created on demand. `ba_init` is extended to scaffold `08-decisions/`.
- README updated to describe the interrogative loop and the `claude mcp add`
  install (already in place).
