import type { Provenance } from "./taxonomy.js";
import { recordDecision, listDecisions, supersede } from "./decisions.js";
import { getOpenItem, transitionOpenItem } from "./openItems.js";

// Unit 10: confirm / correct / reject an OPEN inferred observation.
//
// The confirm-round question (questions.ts:observationQuestions) keys
// `topic === <observation open-item id>`. So an answer whose `topic` resolves to
// an open observation open-item is a confirmation answer, routed here.
//
// Provenance is LOAD-BEARING (Unit 4 / Key Technical Decisions): only
// "user-decided" and "corrected" satisfy the normative gate. "confirmed-as-inferred"
// does NOT — that is what makes the passive-assent guard bite, so a bulk/rapidly
// mass-accepted inference cannot back an FR/NFR without a deliberate re-confirm.

export interface ConfirmAnswer {
  question: string;
  answer: string;
  asked_round: "confirm";
  /** the observation open-item id (the confirm-question's topic). */
  topic: string;
  ref?: string;
  updated?: string;
  /**
   * Explicit reject. When true the inference is dropped: the observation moves to
   * `rejected` (terminal) and NO backing decision is recorded — nothing may rest
   * on it. First-class: the user is never forced to accept the AI's reading.
   */
  resolution?: "reject";
  /**
   * Passive-assent signal (R13). When true (or when the call is `bulk`), an
   * UNCORRECTED confirm is tagged `confirmed-as-inferred` instead of `user-decided`.
   * The exact trigger (a per-answer flag, a batch flag, or N-uncorrected-in-a-row)
   * is a TUNING DETAIL; the specified safety property is the consequence above.
   */
  passive?: boolean;
}

export interface ConfirmResult {
  /** the recorded decision id, or undefined for a reject (no backing recorded). */
  decisionId?: string;
  /** the observation's resulting item_state. */
  itemState: "confirmed" | "corrected" | "rejected";
  provenance?: Provenance;
}

/**
 * Resolve one confirmation answer against its open observation. Caller has already
 * verified `getOpenItem(answer.topic)` is an OPEN observation. `bulk` is the
 * call-level passive-assent flag (a whole-batch mass-confirm).
 */
export function confirmObservation(
  answer: ConfirmAnswer,
  bulk: boolean,
  docsRoot: string,
): ConfirmResult {
  const obs = getOpenItem(answer.topic, docsRoot);
  if (!obs || obs.kind !== "observation") {
    throw new Error(`confirmObservation: ${answer.topic} is not an observation open-item`);
  }

  // Reject path: terminal, no backing decision recorded.
  if (answer.resolution === "reject") {
    transitionOpenItem(answer.topic, "rejected", docsRoot);
    return { itemState: "rejected" };
  }

  // Correct vs confirm: a correction is an answer whose text differs from the
  // observation's claim (the AI's reading). A verbatim echo is a plain confirm.
  const claim = ((obs.claim as string | undefined) ?? (obs.title as string | undefined) ?? "").trim();
  const isCorrection = answer.answer.trim() !== claim;

  let provenance: Provenance;
  let toState: "confirmed" | "corrected";
  if (isCorrection) {
    provenance = "corrected";
    toState = "corrected";
  } else {
    // Uncorrected confirm. Bulk/passive mass-accept → confirmed-as-inferred (does
    // NOT satisfy the normative gate). A deliberate single confirm → user-decided.
    provenance = bulk || answer.passive ? "confirmed-as-inferred" : "user-decided";
    toState = "confirmed";
  }

  // Supersede a PRIOR confirm decision for the same observation if one exists
  // (append-only audit trail — e.g. re-correcting after an earlier confirm). The
  // raw observation is an open-item, not a decision, so the first confirm has no
  // prior decision to supersede; the confirming decision IS the record.
  const prior = listDecisions(docsRoot).find(
    d => d.topic === answer.topic && d.status !== "obsolete",
  );

  const decisionId = recordDecision(
    {
      question: answer.question,
      answer: answer.answer,
      asked_round: "confirm",
      topic: answer.topic, // keep the observation id so the gate/back-trace connects
      provenance,
      ...(answer.ref ? { ref: answer.ref } : {}),
      ...(prior ? { supersedes: [prior.id as string] } : {}),
      ...(answer.updated ? { updated: answer.updated } : {}),
    },
    docsRoot,
  );
  if (prior) supersede(prior.id as string, decisionId, docsRoot);

  transitionOpenItem(answer.topic, toState, docsRoot);
  return { decisionId, itemState: toState, provenance };
}
