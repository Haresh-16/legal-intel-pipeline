import { useEffect, useState } from "react";
import { getApprovals, type ApprovalRow } from "../api/client";

export default function ApprovalLedger() {
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getApprovals()
      .then(({ approvals }) => setApprovals(approvals))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1>Approval Ledger</h1>
      <p className="muted">Read-only record of every approval/archive action taken on output queue items.</p>
      <div className="card-panel">
        <table>
          <thead>
            <tr>
              <th>Output</th>
              <th>Action</th>
              <th>Actor role</th>
              <th>Timestamp</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {approvals.map((a) => (
              <tr key={a.approvalId}>
                <td>{a.outputId}</td>
                <td>{a.action}</td>
                <td>{a.actorRole}</td>
                <td>{a.timestamp}</td>
                <td>{a.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {approvals.length === 0 && <p className="muted">No approvals recorded yet.</p>}
      </div>
    </div>
  );
}
