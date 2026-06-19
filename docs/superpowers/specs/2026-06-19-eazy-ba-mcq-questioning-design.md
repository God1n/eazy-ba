# eazy-ba MCQ Questioning — Design Spec

**Date:** 2026-06-19
**Status:** Approved for planning
**Builds on:** Phase A loop + Phase B change intake (0.3.0)

## Summary

Change how the BA asks questions during the loop. Today questions are
open-ended prose and (in testing) a whole round arrived at once. Instead:

- Every question is presented as **multiple choice (3–5 options) plus an
  explicit "Or describe your own" free-text escape.**
- Questions are asked **one at a time**, and the BA **adapts** later questions
  to earlier answers (a real interview funnel).
- Options come from a **hybrid (C) source**: server-seeded options on a question
  when the choices are genuinely fixed; otherwise the agent generates contextual
  options from the project context. Free-text is always available.

The rendering is the host agent's job (in Claude Code it can use native
multiple-choice UI; elsewhere a numbered list). The server influences it through
(a) an optional `options` field on the question data and (b) the server
instructions. **Recording is unchanged** — whichever the user picks (a listed
option or their own words) is stored verbatim as the answer; options are
presentation-only.

Additive, non-breaking. Ships in the same unpublished release (**0.3.0**).

## Goals

- Lower the effort to answer: a tap/number instead of composing prose, while
  never trapping the user in canned choices (always "your own idea").
- One question at a time, adaptive — later questions react to earlier answers.
- Keep the decision ledger and recording schema unchanged.

## Non-Goals

- No change to `ba_record_answers`, the decisions ledger, or traceability.
- The server does not (and cannot) force a specific UI; it provides options data
  + instructions and the agent renders appropriately per client.
- No mandatory options on open-ended questions — seeding is only where choices
  are genuinely fixed.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Option source | Hybrid (C): server-seeded where fixed, agent-generated otherwise | Server can't know the domain; the agent can. Banks seed only truly-fixed choices. |
| Free-text | Always available ("Or describe your own") | Never trap the user in canned options — core to "don't assume" |
| Pacing | One at a time, adaptive (A) | Adaptivity is the point of a BA interview; MCQ makes each question fast |
| Recording | Unchanged | Options are presentation-only; the chosen/typed answer is stored verbatim |

## Data Shape

`Question` (in `src/core/session.ts`) gains an optional field:

```ts
export interface Question {
  ref: string;
  text: string;
  topic: string;
  round: "surface" | "domain" | "gap" | "change";
  options?: string[];   // server-seeded candidate answers; agent adds more + a free-text escape
}
```

Question-bank YAML entries (and domain checklist dimensions) may carry an
`options:` list. The loaders in `src/core/knowledge.ts` read it; the generators
in `src/core/questions.ts` pass it through onto the emitted `Question`.
`gapQuestions`/`changeQuestions` emit none (agent generates contextual options).

Seed options **only** where the choices are genuinely fixed. Concretely, seed the
surface `constraints` question (e.g. `["A hard deadline", "Specific platform(s)",
"Regulatory/compliance", "Must integrate with an existing system", "No hard
constraints"]`). Leave the open-ended surface questions (problem, scope, users,
success) without seeded options — the agent generates contextual ones.

## Behavior (server instructions)

`INSTRUCTIONS` (in `src/instructions.ts`) gains an "asking" section stating:

- Present each question as **multiple choice**: use the question's `options` if
  present; otherwise generate 3–5 concrete, project-specific options. **Always**
  add a final "Or describe your own" choice.
- Ask **one question at a time**; wait for the answer before the next.
- **Adapt**: use earlier answers to choose and shape later questions; skip
  questions an earlier answer already settled.
- Record whatever the user chooses or types verbatim via `ba_record_answers`
  (unchanged) — a picked option is recorded as its text.

## Architecture

- `src/core/session.ts` — add `options?` to `Question`.
- `src/core/knowledge.ts` — `SurfaceQuestion` (and the checklist entry type)
  gain an optional `options?: string[]`; loaders pass it through.
- `src/knowledge/question-banks/surface.yml` — seed `options` on the
  `constraints` entry only.
- `src/core/questions.ts` — `surfaceQuestions` and `domainQuestions` carry
  `options` onto emitted questions when present.
- `src/instructions.ts` — add the MCQ + free-text + one-at-a-time-adaptive rules.

Each unit stays small and independently testable, consistent with prior phases.

## Error Handling

- `options` is optional everywhere; absence is normal (agent generates).
- No new validation paths; `ba_record_answers` is untouched.

## Testing Strategy

- Vitest, TDD.
- Unit: `surfaceQuestions` emits `options` for the seeded `constraints` question
  and omits the field for an open-ended one; the bank loader round-trips
  `options`.
- Unit: `INSTRUCTIONS` contains the MCQ / "describe your own" / one-at-a-time
  guidance (mirrors existing instruction tests).
- No integration changes — recording/loop behavior is unchanged.

## Release

Additive; rides the unpublished **0.3.0**. Build on a fresh branch after PR #2
(Phase B) merges, to keep it separate from the change-intake review.
