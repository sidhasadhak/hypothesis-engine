export type Verdict = "confirmed" | "refuted" | "inconclusive" | "untested";

export interface Hypothesis {
  id: string;
  description: string;
  confidence: number;
  verdict: Verdict;
  key_finding: string;
}

export interface StatResult {
  type: "anomaly" | "trend" | "comparison" | "distribution";
  interpretation: string;
  is_significant: boolean;
  sigma: number | null;
  p_value: number | null;
}

export interface QuerySummary {
  sql: string;
  row_count: number;
  error: string | null;
  stats: StatResult[];
}

export interface Finding {
  claim: string;
  evidence: string;
  confidence: number;
}

export interface DataQualityNote {
  table: string;
  column: string | null;
  issue: string;
  impact: string;
  recommended_fix: string;
}

export interface Report {
  headline: string;
  verdict: string;
  key_findings: Finding[];
  what_is_not_the_cause: string[];
  data_quality_notes: DataQualityNote[];
  risks: string[];
  recommended_actions: string[];
}

// SSE event shapes
export type InvestigationEvent =
  | { type: "start"; question: string }
  | { type: "hypotheses"; hypotheses: Hypothesis[] }
  | { type: "queries_executed"; iteration: number; hypothesis_idx: number; queries: QuerySummary[]; corrections: { fix_explanation: string; data_quality_issue: string | null }[]; stats: StatResult[] }
  | { type: "score"; iteration: number; score: { hypothesis_id: string; confidence: number; verdict: Verdict; key_finding: string }; hypotheses: Hypothesis[] }
  | { type: "report"; report: Report; hypotheses: Hypothesis[]; query_count: number }
  | { type: "error"; message: string }
  | { type: "done" };

export interface InvestigationState {
  status: "idle" | "running" | "done" | "error";
  question: string;
  hypotheses: Hypothesis[];
  queriesExecuted: number;
  currentIteration: number;
  log: string[];
  report: Report | null;
  error: string | null;
  statsPerHypothesis: Record<number, StatResult[]>;
}
