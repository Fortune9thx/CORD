/** Shapes the contract's JSON views return. */

export type Clause = { id: string; text: string };

export type GrantStatus =
  | "PROPOSED"
  | "ACTIVE"
  | "DENIED"
  | "AMBIGUOUS"
  | "RETRYABLE"
  | "REVOKED"
  | "EXPIRED";

export type Grant = {
  id: string;
  grantor: string;
  grantee: string;
  parent_id: string;
  version: number;
  depth: number;
  expiry: number;
  capabilities: string[];
  resources: string[];
  clauses: Clause[];
  status: GrantStatus;
  tainted: boolean;
  created_at: number;
  /** Derived by the contract at read time. */
  effective_status: GrantStatus;
  effective: boolean;
  effective_reason: string;
  scope_fingerprint: string;
};

export type ReviewVerdict =
  | "NARROWER_OR_EQUAL"
  | "EXPANDS_AUTHORITY"
  | "AMBIGUOUS"
  | "UNVERIFIABLE";

export type Review = {
  grant_id: string;
  kind: "review" | "challenge";
  verdict: ReviewVerdict;
  expansion_clause_ids: string[];
  ambiguity_clause_ids: string[];
  prohibitions_covered: boolean;
  bond: number;
  slashed: number;
  settled_at: number;
  challenger?: string;
  upheld?: boolean;
};

export type UseDecision = "WITHIN_SCOPE" | "OUT_OF_SCOPE" | "INCONCLUSIVE";

export type UseRecord = {
  id: string;
  grant_id: string;
  actor: string;
  action: string;
  evidence_urls: string[];
  decision: UseDecision;
  violated_clause_ids: string[];
  bond: number;
  slashed: number;
  settled_at: number;
};
