import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getCard, getSource, getQueue, type CardRow, type ClaimRow, type SourceRow, type OutputRow } from "../api/client";

function statusBadgeClass(status: string): string {
  if (status.startsWith("HOLD")) return "badge-hold";
  if (status === "approved") return "badge-approved";
  if (status === "archived") return "badge-archived";
  return "badge-hold";
}

function PublicDraftPanel({ output }: { output: OutputRow | undefined }) {
  if (!output) return <p className="muted">No public draft yet.</p>;
  const content = JSON.parse(output.content) as { headline: string; body_paragraphs: string[]; claim_references: string[] };
  return (
    <div>
      <span className={`badge ${statusBadgeClass(output.status)}`}>{output.status}</span>
      <h3>{content.headline}</h3>
      {content.body_paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <p className="muted">References claims: {content.claim_references.join(", ")}</p>
    </div>
  );
}

function InternalBriefPanel({ output }: { output: OutputRow | undefined }) {
  if (!output) return <p className="muted">No internal brief yet.</p>;
  const content = JSON.parse(output.content) as Record<string, string>;
  return (
    <div>
      <div className="internal-banner">Internal only — never shown publicly</div>
      <span className={`badge ${statusBadgeClass(output.status)}`}>{output.status}</span>
      {Object.entries(content).map(([key, value]) => (
        <p key={key}>
          <strong>{key.replace(/_/g, " ")}:</strong> {value}
        </p>
      ))}
    </div>
  );
}

export default function ItemDetail() {
  const { card_id } = useParams<{ card_id: string }>();
  const [card, setCard] = useState<CardRow | null>(null);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [source, setSource] = useState<SourceRow | null>(null);
  const [publicOutput, setPublicOutput] = useState<OutputRow | undefined>(undefined);
  const [internalOutput, setInternalOutput] = useState<OutputRow | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!card_id) return;
    (async () => {
      try {
        const cardData = await getCard(card_id);
        setCard(cardData.card);
        setClaims(cardData.claims);

        if (cardData.sourceIds[0]) {
          const sourceData = await getSource(cardData.sourceIds[0]);
          setSource(sourceData.source);
        }

        const queue = await getQueue();
        setPublicOutput(queue.public_drafts.find((o) => o.cardId === card_id));
        setInternalOutput(queue.internal_briefs.find((o) => o.cardId === card_id));
      } catch {
        setError("Failed to load this item.");
      }
    })();
  }, [card_id]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!card) return <p>Loading...</p>;

  return (
    <div>
      <p>
        <Link to="/queue">&larr; Back to Review Queue</Link>
      </p>
      <h1>{card.title}</h1>

      <div className="card-panel">
        <h2>Source</h2>
        {source ? (
          <>
            <p>
              <strong>{source.title}</strong> — {source.publisher ?? "Unknown publisher"}
            </p>
            <p className="muted">
              Proof grade: {source.proofGrade ?? "n/a"} · {source.primarySecondary} · {source.sourceType}
            </p>
            {source.url && (
              <p>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.url}
                </a>
              </p>
            )}
            <p>{source.keyExtract}</p>
          </>
        ) : (
          <p className="muted">No source linked.</p>
        )}
      </div>

      <div className="card-panel">
        <h2>Intelligence Card</h2>
        <p className="muted">
          Vertical: {card.vertical ?? "n/a"} · Status: {card.status} · Risk: {card.riskLevel ?? "n/a"} · Proof grade:{" "}
          {card.proofGrade ?? "n/a"}
        </p>
        <p>{card.narrativeGapSummary}</p>
        <p className="muted">Monetization path: {card.monetizationPath ?? "n/a"}</p>
      </div>

      <div className="card-panel">
        <h2>Claims</h2>
        <table>
          <thead>
            <tr>
              <th>Approved public version</th>
              <th>Proof grade</th>
              <th>Scope limitation</th>
              <th>Risk notes</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((claim) => (
              <tr key={claim.claimId}>
                <td>{claim.approvedPublicVersion}</td>
                <td>{claim.proofGrade ?? "n/a"}</td>
                <td>{claim.scopeLimitation ?? "n/a"}</td>
                <td>{claim.riskNotes ?? "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="two-col">
        <div className="card-panel">
          <h2>Public Draft</h2>
          <PublicDraftPanel output={publicOutput} />
        </div>
        <div className="card-panel">
          <h2>Internal Brief</h2>
          <InternalBriefPanel output={internalOutput} />
        </div>
      </div>
    </div>
  );
}
