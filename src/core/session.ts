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
