import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { postIntake, ApiError } from "../api/client";

export default function Intake() {
  const [rawText, setRawText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await postIntake(rawText);
      navigate(`/item/${result.cardId}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong submitting this source.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>Manual Intake</h1>
      <p className="muted">
        Paste the raw text of a source (article, filing, regulatory notice). It will be normalized, drafted into an
        intelligence card and claims, and held for review — everything stays on hold until a human explicitly
        approves it.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit} className="card-panel">
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste source text here..."
          required
        />
        <div style={{ marginTop: "0.75rem" }}>
          <button type="submit" disabled={submitting || rawText.trim().length === 0}>
            {submitting ? "Processing..." : "Run Intake Pipeline"}
          </button>
        </div>
      </form>
    </div>
  );
}
