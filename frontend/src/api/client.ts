export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : `Request failed: ${status}`);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export interface SourceRow {
  sourceId: string;
  title: string;
  publisher: string | null;
  author: string | null;
  datePublished: string | null;
  dateCaptured: string;
  url: string | null;
  sourceType: string;
  primarySecondary: string;
  proofGrade: string | null;
  keyExtract: string | null;
}

export interface ClaimRow {
  claimId: string;
  cardId: string;
  exactClaim: string;
  approvedPublicVersion: string;
  proofGrade: string | null;
  scopeLimitation: string | null;
  riskNotes: string | null;
  doNotSay: string | null;
  status: string;
}

export interface CardRow {
  cardId: string;
  title: string;
  vertical: string | null;
  status: string;
  proofGrade: string | null;
  riskLevel: string | null;
  publicUseStatus: string | null;
  approvalOwner: string | null;
  monetizationPath: string | null;
  narrativeGapSummary: string | null;
}

export interface OutputRow {
  outputId: string;
  cardId: string;
  outputType: "public_draft" | "internal_brief";
  status: string;
  content: string;
  monetizationPathTag: string | null;
  createdAt: string;
}

export interface ApprovalRow {
  approvalId: string;
  outputId: string;
  action: string;
  actorRole: string;
  timestamp: string;
  notes: string | null;
}

export interface NewsCandidateRow {
  candidateId: string;
  title: string;
  url: string;
  publisher: string | null;
  publishedAt: string | null;
  snippet: string | null;
  status: "fetched" | "selected" | "ingested" | "rejected";
  sourceId: string | null;
}

export interface PipelineResult {
  sourceId: string;
  cardId: string;
  claimIds: string[];
  publicOutputId: string;
  internalOutputId: string;
}

export function postIntake(rawText: string): Promise<PipelineResult> {
  return request("/intake", { method: "POST", body: JSON.stringify({ rawText }) });
}

export function fetchNewsCandidates(): Promise<{ fetched: number; inserted: number; candidateIds: string[] }> {
  return request("/news/fetch", { method: "POST" });
}

export function getNewsInbox(): Promise<{ candidates: NewsCandidateRow[] }> {
  return request("/news/inbox");
}

export function ingestCandidate(candidateId: string): Promise<PipelineResult> {
  return request(`/news/ingest/${candidateId}`, { method: "POST" });
}

export function getSource(sourceId: string): Promise<{ source: SourceRow }> {
  return request(`/sources/${sourceId}`);
}

export function getCard(cardId: string): Promise<{ card: CardRow; claims: ClaimRow[]; sourceIds: string[] }> {
  return request(`/cards/${cardId}`);
}

export function getQueue(): Promise<{ public_drafts: OutputRow[]; internal_briefs: OutputRow[] }> {
  return request("/queue");
}

export function getOutput(outputId: string): Promise<{ output: OutputRow }> {
  return request(`/queue/${outputId}`);
}

export function postApproval(
  outputId: string,
  body: { actor_role: string; action: "approve" | "archive"; notes?: string },
): Promise<{ approvalId: string; outputId: string; status: string; assetId: string | null }> {
  return request(`/approvals/${outputId}`, { method: "POST", body: JSON.stringify(body) });
}

export function getApprovals(): Promise<{ approvals: ApprovalRow[] }> {
  return request("/approvals");
}
