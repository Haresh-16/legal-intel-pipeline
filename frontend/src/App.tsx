import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Intake from "./pages/Intake";
import NewsInbox from "./pages/NewsInbox";
import ItemDetail from "./pages/ItemDetail";
import ReviewQueue from "./pages/ReviewQueue";
import ApprovalLedger from "./pages/ApprovalLedger";

export default function App() {
  return (
    <BrowserRouter>
      <nav className="nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          Intake
        </NavLink>
        <NavLink to="/news" className={({ isActive }) => (isActive ? "active" : "")}>
          News Inbox
        </NavLink>
        <NavLink to="/queue" className={({ isActive }) => (isActive ? "active" : "")}>
          Review Queue
        </NavLink>
        <NavLink to="/approvals" className={({ isActive }) => (isActive ? "active" : "")}>
          Approval Ledger
        </NavLink>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Intake />} />
          <Route path="/news" element={<NewsInbox />} />
          <Route path="/item/:card_id" element={<ItemDetail />} />
          <Route path="/queue" element={<ReviewQueue />} />
          <Route path="/approvals" element={<ApprovalLedger />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
