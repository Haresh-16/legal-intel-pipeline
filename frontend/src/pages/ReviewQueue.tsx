import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getQueue, postApproval, ApiError, type OutputRow } from "../api/client";

const APPROVAL_ROLES = ["Intelligence Desk", "Writer", "Builder", "Ops", "Legal", "Principal"];

function statusBadgeClass(status: string): string {
  if (status.startsWith("HOLD")) return "badge-hold";
  if (status === "approved") return "badge-approved";
  if (status === "archived") return "badge-archived";
  return "badge-hold";
}

function PublicDraftRow({ output, onActed }: { output: OutputRow; onActed: () => void }) {
  const content = JSON.parse(output.content) as { headline: string; body_paragraphs: string[] };
  const [role, setRole] = useState(APPROVAL_ROLES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHold = output.status.startsWith("HOLD");

  async function act(action: "approve" | "archive") {
    setError(null);
    setSubmitting(true);
    try {
      await postApproval(output.outputId, { actor_role: role, action });
      onActed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record approval.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card-panel">
      <div className="row-actions" style={{ justifyContent: "space-between" }}>
        <strong>{content.headline}</strong>
        <span className={`badge ${statusBadgeClass(output.status)}`}>{output.status}</span>
      </div>
      <p>{content.body_paragraphs[0]}</p>
      <p className="muted">
        <Link to={`/item/${output.cardId}`}>View full item</Link>
      </p>
      {error && <div className="error-banner">{error}</div>}
      {isHold && (
        <div className="row-actions">
          <select value={role} onChange={(e) => setRole(e.target.value)} disabled={submitting}>
            {APPROVAL_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button onClick={() => act("approve")} disabled={submitting}>
            Approve
          </button>
          <button className="secondary" onClick={() => act("archive")} disabled={submitting}>
            Archive
          </button>
        </div>
      )}
    </div>
  );
}

function InternalBriefRow({ output }: { output: OutputRow }) {
  const content = JSON.parse(output.content) as Record<string, string>;
  return (
    <div className="card-panel">
      <div className="internal-banner">Internal only — never shown publicly, no approval action here</div>
      <div className="row-actions" style={{ justifyContent: "space-between" }}>
        <strong>{content.practice_area_signal ?? output.outputId}</strong>
        <span className={`badge ${statusBadgeClass(output.status)}`}>{output.status}</span>
      </div>
      <p className="muted">
        <Link to={`/item/${output.cardId}`}>View full item</Link>
      </p>
    </div>
  );
}

export default function ReviewQueue() {
  const [publicDrafts, setPublicDrafts] = useState<OutputRow[]>([]);
  const [internalBriefs, setInternalBriefs] = useState<OutputRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { public_drafts, internal_briefs } = await getQueue();
    setPublicDrafts(public_drafts);
    setInternalBriefs(internal_briefs);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1>Review Queue</h1>

      <section>
        <h2>Public Drafts</h2>
        <p className="muted">Held until an explicit human approval. Approving here is the only way an item leaves HOLD status.</p>
        {publicDrafts.length === 0 ? <p className="muted">Nothing in the public queue.</p> : publicDrafts.map((o) => <PublicDraftRow key={o.outputId} output={o} onActed={load} />)}
      </section>

      <section>
        <h2>Internal Briefs</h2>
        <p className="muted">Internal-only outputs. Kept separate from public drafts; no approval action applies here.</p>
        {internalBriefs.length === 0 ? <p className="muted">Nothing in the internal queue.</p> : internalBriefs.map((o) => <InternalBriefRow key={o.outputId} output={o} />)}
      </section>
    </div>
  );
}
