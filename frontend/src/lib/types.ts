// frontend/src/lib/types.ts — shared API shapes

export type DocStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface DocumentMeta {
  document_id: string;
  filename: string;
  status: DocStatus;
  created_at: string;
}

export interface RedFlag {
  severity?: "CRITICAL" | "HIGH" | "MODERATE" | string;
  issue?: string;
  reasoning?: string;
  explanation?: string;
  description?: string;
  clause_reference?: string;
  kanoon_citation?: string;
  kanoon_url?: string;
}

export interface DocumentDetails extends DocumentMeta {
  summary?: string;
  extracted_clauses?: unknown[];
  red_flags?: RedFlag[];
}

export interface ChatTurn {
  role: "user" | "ai";
  text: string;
}
