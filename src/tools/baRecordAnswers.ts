import { z } from "zod";
import { resolveConfig } from "../config.js";
import { recordDecision, listDecisions, getDecision, supersede } from "../core/decisions.js";
import { listOpenItems, transitionOpenItem, getOpenItem } from "../core/openItems.js";
import { confirmObservation } from "../core/confirmObservation.js";
import { readSession, writeSession } from "../core/session.js";
import { RoundEnum } from "../core/taxonomy.js";

export const baRecordAnswersSchema = z.object({
  projectRoot: z.string(),
  // Passive-assent signal (Flow 2 R13): a whole-batch UNCORRECTED mass-confirm.
  // When true, every plain (uncorrected) confirm-round answer that resolves an
  // inferred observation is tagged provenance "confirmed-as-inferred" rather than
  // "user-decided" — which, per the Unit 4 gate, does NOT satisfy a normative
  // artifact's backing requirement. A deliberate single confirm omits this flag.
  // The exact bulk/rapid trigger is a TUNING DETAIL; this consequence is the spec.
  bulk: z.boolean().optional(),
  items: z.array(z.object({
    question: z.string(),
    answer: z.string(),
    asked_round: RoundEnum,
    topic: z.string(),
    ref: z.string().optional(),
    supersedes: z.array(z.string()).optional(),
    // Confirm-round controls for an inferred-observation answer (topic === the
    // observation open-item id). `resolution: "reject"` drops the inference (no
    // backing recorded); `passive` tags a single confirm as passive assent.
    resolution: z.literal("reject").optional(),
    passive: z.boolean().optional(),
  })).min(1),
});

export function baRecordAnswers(input: z.infer<typeof baRecordAnswersSchema>): { recorded: string[]; skipped: string[] } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const session = readSession(docsRoot);
  if (!session) throw new Error("No active session. Call ba_session_start first.");

  // Pre-flight validate all supersedes ids (exist and not already superseded),
  // before recording anything, so a bad supersede leaves no partial state.
  for (const item of input.items) {
    for (const old of item.supersedes ?? []) {
      const dec = getDecision(old, docsRoot);
      if (!dec) throw new Error(`Cannot supersede unknown decision: ${old}`);
      if (dec.status === "obsolete") throw new Error(`Cannot supersede an already-obsolete decision: ${old}`);
    }
  }

  // Fix 13: passive-assent server backstop. The agent can omit the `bulk` flag,
  // but a single call carrying 3+ UNCORRECTED confirm answers (a confirm resolving
  // an OPEN observation, no reject, whose answer is empty or a verbatim echo of the
  // claim) is a mass-accept regardless. When that threshold is met we force the
  // confirmed-as-inferred provenance on ALL confirms in the call, so a bulk sweep
  // cannot silently back a normative artifact even without the flag.
  const uncorrectedConfirmCount = input.items.filter(item => {
    if (item.resolution === "reject") return false;
    const oi = getOpenItem(item.topic, docsRoot);
    if (!oi || oi.kind !== "observation" || oi.item_state !== "open") return false;
    const claim = ((oi.claim as string | undefined) ?? (oi.title as string | undefined) ?? "").trim();
    const ans = item.answer.trim();
    return ans.length === 0 || ans === claim; // uncorrected: empty or verbatim echo
  }).length;
  const effectiveBulk = input.bulk === true || uncorrectedConfirmCount >= 3;

  // Dedupe by question ref so retries are idempotent: an item whose ref already
  // has a recorded decision is skipped rather than recorded twice.
  const seenRefs = new Set(listDecisions(docsRoot).map(d => d.ref as string | undefined).filter(Boolean));
  const recorded: string[] = [];
  const skipped: string[] = [];
  // Fix 10: only topics that actually recorded a coverage-topic answer here retire
  // the matching coverage-topic gate. Items routed to the observation/confirm path
  // (and rejected items) must NOT retire a coverage-topic that shares their topic.
  const coverageAnsweredTopics = new Set<string>();
  for (const item of input.items) {
    if (item.ref && seenRefs.has(item.ref)) { skipped.push(item.ref); continue; }

    // Confirmation round (Unit 10): an answer whose `topic` resolves to an OPEN
    // observation open-item is confirming/correcting/rejecting an inference — not a
    // plain decision. Route it through confirmObservation, which sets the load-bearing
    // provenance (user-decided / corrected / confirmed-as-inferred), supersedes any
    // prior confirm decision, and transitions the observation out of "open". A reject
    // records NO backing decision (nothing may rest on it).
    // Route when the topic is an observation that is still resolvable: `open`, or an
    // already-resolved `confirmed`/`corrected` one being re-corrected (supersede the
    // prior decision). Terminal `rejected`/`applied` observations are NOT re-opened.
    const obs = getOpenItem(item.topic, docsRoot);
    const resolvable = obs?.item_state === "open" || obs?.item_state === "confirmed" || obs?.item_state === "corrected";
    if (obs && obs.kind === "observation" && resolvable) {
      const result = confirmObservation(
        {
          question: item.question,
          answer: item.answer,
          asked_round: "confirm",
          topic: item.topic,
          ref: item.ref,
          resolution: item.resolution,
          passive: item.passive,
        },
        effectiveBulk,
        docsRoot,
      );
      if (result.decisionId) {
        recorded.push(result.decisionId);
        if (item.ref) seenRefs.add(item.ref);
      }
      continue;
    }

    const newId = recordDecision(item, docsRoot);
    recorded.push(newId);
    if (item.ref) seenRefs.add(item.ref);
    for (const old of item.supersedes ?? []) supersede(old, newId, docsRoot);
    // Fix 10: this item took the plain-decision path — its topic may answer a
    // coverage-topic gate. Only such items are eligible to retire a coverage-topic.
    coverageAnsweredTopics.add(item.topic);
  }

  // Retire the coverage-topic gate when its topic is answered. A coverage-topic
  // open-item (floor:* or a declared plan topic) is keyed by its `topic`; recording
  // a decision against that topic answers it, so transition the matching open item
  // to "answered" — it then stops gating stability on the next computeAssessment.
  // This is what makes the floor (Unit 5) answerable through the normal answer path
  // and lets floor-only discovery converge (R5b). Idempotent: transitioning an
  // already-answered (or terminal) item is a no-op / safely guarded.
  // Fix 10: retire only from items that actually recorded a coverage-topic answer
  // (the plain-decision path), never from confirm/observation-routed or rejected
  // items — those share a `topic` (the observation id) that must not retire a gate.
  for (const oi of listOpenItems(docsRoot)) {
    if (oi.kind !== "coverage-topic" || oi.item_state !== "open") continue;
    if (coverageAnsweredTopics.has(oi.topic as string)) {
      transitionOpenItem(oi.id as string, "answered", docsRoot);
    }
  }

  // Clear answered open questions by ref when available, falling back to exact text.
  const answeredRefs = new Set(input.items.map(i => i.ref).filter(Boolean));
  const answeredTexts = new Set(input.items.map(i => i.question));
  const open_questions = session.open_questions.filter(
    q => !answeredRefs.has(q.ref) && !answeredTexts.has(q.text),
  );

  writeSession({
    ...session,
    open_questions,
    pending_apply: [...session.pending_apply, ...recorded],
    updated: new Date().toISOString().slice(0, 10),
  }, docsRoot);
  return { recorded, skipped };
}
