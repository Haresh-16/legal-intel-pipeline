import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchNewsCandidates, getNewsInbox, ingestCandidate, ApiError, type NewsCandidateRow } from "../api/client";

export default function NewsInbox() {
  const [candidates, setCandidates] = useState<NewsCandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function loadInbox() {
    setLoading(true);
    try {
      const { candidates } = await getNewsInbox();
      setCandidates(candidates);
    } catch {
      setError("Failed to load the inbox.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInbox();
  }, []);

  async function handleFetch() {
    setError(null);
    setFetching(true);
    try {
      await fetchNewsCandidates();
      await loadInbox();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to fetch candidates from The News API.");
    } finally {
      setFetching(false);
    }
  }

  async function handleIngest(candidateId: string) {
    setError(null);
    setIngestingId(candidateId);
    try {
      const result = await ingestCandidate(candidateId);
      navigate(`/item/${result.cardId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to ingest this candidate.");
      setIngestingId(null);
      await loadInbox();
    }
  }

  return (
    <div>
      <h1>News Inbox</h1>
      <p className="muted">
        Candidates are discovered automatically from The News API, but nothing is processed until you explicitly
        ingest it below.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <div style={{ marginBottom: "1rem" }}>
        <button onClick={handleFetch} disabled={fetching}>
          {fetching ? "Fetching..." : "Fetch candidates"}
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : candidates.length === 0 ? (
        <p className="muted">No candidates yet — click "Fetch candidates" to discover some.</p>
      ) : (
        candidates.map((candidate) => (
          <div key={candidate.candidateId} className="card-panel">
            <div className="row-actions" style={{ justifyContent: "space-between" }}>
              <strong>{candidate.title}</strong>
              <span className={`badge badge-${candidate.status}`}>{candidate.status}</span>
            </div>
            <p className="muted">
              {candidate.publisher ?? "Unknown source"} · {candidate.publishedAt ?? "Unknown date"}
            </p>
            {candidate.snippet && <p>{candidate.snippet}</p>}
            <p>
              <a href={candidate.url} target="_blank" rel="noreferrer">
                {candidate.url}
              </a>
            </p>
            {candidate.status === "fetched" && (
              <button onClick={() => handleIngest(candidate.candidateId)} disabled={ingestingId === candidate.candidateId}>
                {ingestingId === candidate.candidateId ? "Ingesting..." : "Ingest"}
              </button>
            )}
            {candidate.status === "ingested" && candidate.sourceId && (
              <p className="muted">Already ingested as source {candidate.sourceId}.</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
