---
date: 2026-06-30
topic: two-flow-outcome
focus: aligning eazy-ba to the user's end-to-end expected outcome (greenfield + running-project flows)
---

# Ideation: eazy-ba — the Two-Flow Outcome

## North Star (user's expected outcome)

**Flow 1 — Greenfield discovery**
1. User tells a surface story about the product.
2. AI asks a surface Q&A round — all multiple-choice.
3. AI **researches the domain** using the story + the surface answers.
4. AI asks a long Q&A round (multiple-choice) covering **every decision**, using all of the above to get the user's feedback.
5. AI creates all the documents needed.
6. User reviews and gives feedback.

**Flow 2 — Existing / running project**
1. AI grasps a half- or fully-built project.
2. AI writes "as-is" documents for the current level.
3. AI asks the user what he needs at the moment.
4. Long Q&A round.
5. AI updates all documents with this data.

**Cross-cutting:** the user can request changes/extensions to any document through the tool.

## Codebase Context (v0.3.0, grounded against source)

eazy-ba is a TypeScript MCP server — a personal Business Analyst built on an
**anti-assumption interrogative loop**. Markdown-as-database under `docs/ba/`;
relationships live in YAML frontmatter; analysis is derived. The DEC-### decision
ledger + bidirectional traceability graph is the crown jewel.

9 public tools: `ba_init`, `ba_session_start`, `ba_assess`, `ba_record_answers`,
`ba_apply`, `ba_status`, `ba_impact`, `ba_get`, `ba_list`. The server never talks
to the user directly — it emits questions; the host agent relays them.

Loop engine (`computeAssessment`, `src/core/assessment.ts`): three entry modes
(discovery / change / stabilize) over one engine — assess → record → apply →
re-assess until stable (recomputed from disk).

### Gap analysis: outcome vs. current build

| Step | Status | Notes |
|------|--------|-------|
| F1. Surface story as input | ⚠️ Partial | Surface round = **fixed question bank** (`surfaceQuestions()`), ignores the told story. |
| F1. Surface MCQ round | ✅ Built | MCQ + "describe your own", one-at-a-time. |
| F1. **Research the domain** | ❌ Missing | No research step; nothing synthesizes story + answers into domain understanding. |
| F1. Long Q&A on all decisions | ⚠️ Weak | Deep round = static checklists × existing artifacts; not research-driven; needs docs to exist first. |
| F1. Create all docs | ⚠️ Partial | `ba_apply` writes only persona/FR/NFR/use-case/story; vision/glossary/risk/assumption not file-backed; created incrementally, not in one pass. |
| F1. Review & feedback | ⚠️ Manual | Review = read markdown; feedback = change mode + hand-find IDs. |
| F2. Grasp a running project | ❌ Missing | Tool cannot read the codebase; `ba_ground` unbuilt. |
| F2. Write "as-is" docs | ❌ Missing | Change mode assumes docs already exist; no reverse-engineering path. |
| F2. Feedback → Q&A → update | ⚠️ Partial | Change loop works; `changeQuestions` narrow (only artifacts touched by a superseded decision). |
| Change / extend by request | ✅ Built (Phase B) | Append-only supersede + `ba_impact` blast radius. "Extend" lacks a clean front door. |

### The three real gaps

1. **Research + adaptive deep round** (heart of Flow 1) — take the story + surface
   answers, research the domain, and generate a long tailored decision-by-decision
   MCQ round. Relates to unbuilt `ba_elicit` / `ba_ingest`.
2. **Bootstrap from a running project → as-is docs** (all of Flow 2) — `ba_ground`:
   read the half/done codebase, produce current-state docs, then enter the loop.
3. **Clean review→feedback / request-a-change front door** — plain-English change
   requests without hunting for IDs.

## Ranked Ideas

### 1. Close the BA↔code loop — `ba_ground` + drift detection
**Description:** Implement `ba_ground` as persisted edges (`grounded_in: [file.ts#L40-90]`, inverse of `derived_from`), hash anchored spans, and emit a **drift gap** on `ba_assess` when code moves without a superseding decision. Brownfield: pre-fill decisions the code already answers. This is the engine behind Flow 2's "grasp a running project / write as-is docs."
**Rationale:** Biggest unexploited asset; `impact.ts` already does transitive closure over edge kinds, so `grounded_in` is a small extension. Directly enables Flow 2.
**Downsides:** Only tool allowed outside `docs/ba/`; code→requirement mapping is fuzzy.
**Confidence:** 80% · **Complexity:** High · **Status:** Explored (selected — Flow 2, 2nd in sequence)

### 2. `ba_ingest` / research-driven deep round (Flow 1 engine)
**Description:** Take the surface story + surface answers, research the domain, and synthesize a long tailored MCQ round on every decision — routed through the record→apply gate as proposals requiring confirmation (anti-assumption preserved). Replaces the static checklist deep round.
**Rationale:** The heart of the "real BA" promise; reused by both flows. Today the surface round ignores the story and the deep round is a static cartesian product.
**Downsides:** Extraction/research quality varies; must respect "server never talks to user."
**Confidence:** 82% · **Complexity:** Medium · **Status:** Explored (selected — Flow 1, 1st in sequence)

### 3. Make the graph visible — `ba_visualize` (Mermaid) + `ba_rtm`
**Description:** Two derived, read-only views from frontmatter: Mermaid traceability graph (status/severity colored, superseded greyed) and a real RTM table with coverage gaps highlighted.
**Rationale:** Pure leverage — zero new data, reuses `buildGraph()`/`detectGaps()`. The headline demo that makes the review step real.
**Downsides:** Mermaid unreadable past N nodes; needs scoping.
**Confidence:** 88% · **Complexity:** Low · **Status:** Unexplored

### 4. File-back the `assumption` type (and risk/glossary)
**Description:** Extend `ba_apply` to materialize declared-but-excluded types (ASM/RSK/GLO), especially assumptions as tracked, supersedable artifacts with a validation trigger.
**Rationale:** The philosophy is anti-assumption, yet assumptions can't be recorded as first-class artifacts. Closes a silent partial-support gap.
**Downsides:** Each type needs gap rules + question coverage to be meaningful.
**Confidence:** 85% · **Complexity:** Low · **Status:** Unexplored

### 5. `ba_rationale` — "why does this exist?"
**Description:** Reverse-traversal view from any artifact (later: grounded code line) back through `derived_from`/`informs` to the originating decisions.
**Rationale:** Reframes eazy-ba from doc generator to decision memory — the durable differentiator; reverse of `ba_impact`.
**Downsides:** Harder to demo than a diagram; overlaps with RTM.
**Confidence:** 72% · **Complexity:** Low · **Status:** Unexplored

### 6. Tame the interrogation (daily-use friction)
**Description:** (a) dry-run `ba_apply --preview` returning the diff before writing; (b) ranked question budget — emit top-N domain questions by blast-radius weight instead of the full cartesian product.
**Rationale:** MCQ one-at-a-time is punishing at scale; `impact.ts` already has the weighting machinery.
**Downsides:** A cluster, not one feature.
**Confidence:** 75% · **Complexity:** Low–Medium · **Status:** Unexplored

### 7. Cross-project decision corpus — `ba_export` + seed
**Description:** Export ledger + graph as a portable bundle; let `ba_init` seed a new project from a prior bundle's patterns (recurring NFR/glossary/persona).
**Rationale:** Career-long compounding; keys off the `topic` tag every DEC carries.
**Downsides:** Cross-project pattern matching unproven; risks reintroducing assumptions if seeds aren't re-confirmed.
**Confidence:** 60% · **Complexity:** High · **Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Expose graph as MCP Resources | Better after RTM/graph view exists — defer |
| 2 | `ba_handoff` / `ba_brief` (client-facing) | Expands past solo/personal core; brainstorm variant later |
| 3 | Shared BA layer across repos (product-line) | Premature; multi-project was an explicit non-goal; expensive |
| 4 | Confidence-score instead of binary "stable" | Risks destabilizing a well-defined invariant; brainstorm variant |
| 5 | Severity-as-gate / auto-supersede-chain | Incremental — fold into change-mode polish |
| 6 | Persist rejected MCQ options as alternatives | Speculative value; nice-to-have |
| 7 | `ba_lint` standalone | Mostly re-packages existing gap detection; low novelty |
| 8 | Showcase repo + recorded transcript | Marketing artifact, not a product improvement |

## Session Log
- 2026-06-30: Initial ideation — ~40 candidates across 4 frames, 7 survived. User then articulated the two-flow expected outcome; doc reframed around it. Gap analysis grounded against `assessment.ts` / `instructions.ts`. User chose to brainstorm **both gaps in sequence**: Flow 1 research engine (idea #2) first, then Flow 2 bootstrap (idea #1). Both marked Explored; handing off to brainstorming.
- 2026-06-30: Flow 1 brainstormed → `docs/brainstorms/2026-06-30-flow1-research-deep-round-requirements.md`. Key decisions: agent-driven open-ended research; convergence = rich artifact-independent floor + user-visible agent coverage plan; research is bonus depth (floor-only is legitimate); soft "good enough" off-ramp; draft-then-finalize lifecycle. Ran document-review (5 personas, 28 findings; 11 auto-fixed, 3 product decisions resolved). Next: Flow 2 (`ba_ground`) brainstorm, then plan.
- 2026-06-30: Flow 2 brainstormed → `docs/brainstorms/2026-06-30-flow2-ba-ground-bootstrap-requirements.md`. ba_ground = only tool reading outside docs/ba/. Key decisions: as-is docs = "observations to confirm" (provenance layer), not ground truth; agent-decided extraction; one-shot bootstrap (drift deferred but anchors are drift-ready); confidence auto-accept; **fact≠requirement** (facts back descriptive artifacts only; normative FR/NFR need a confirmed decision); fail-safe verifiable/inferred classification; passive-assent guard (R13). Document-review (6 personas incl. security, 40+ findings; 3 P0s on security + gameable classification + gate mechanics, all addressed). 2 Resolve-Before-Planning items left for top of /ce:plan: observation/coverage-item unification + the closed verifiable-fact set. Next: /ce:plan the shared spine for both flows.
