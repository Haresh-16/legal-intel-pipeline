import { z } from "zod";

export const ProofGrade = z.enum(["A", "B", "C"]);
export type ProofGrade = z.infer<typeof ProofGrade>;

export const RiskLevel = z.enum(["Low", "Medium", "High"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const PublicUseStatus = z.enum([
  "Public",
  "Website-safe after approval",
  "Hold pending verification",
  "Internal-only",
]);
export type PublicUseStatus = z.infer<typeof PublicUseStatus>;

export const RecordStatus = z.enum([
  "Research lead",
  "Card drafted",
  "Draft ready",
  "Hold",
  "Approved",
  "Published",
  "Archived",
]);
export type RecordStatus = z.infer<typeof RecordStatus>;

export const OutputStatus = z.enum(["HOLD — pending approval", "approved", "archived"]);
export type OutputStatus = z.infer<typeof OutputStatus>;

export const InboxStatus = z.enum(["fetched", "selected", "ingested", "rejected"]);
export type InboxStatus = z.infer<typeof InboxStatus>;

export const ApprovalRole = z.enum([
  "Intelligence Desk",
  "Writer",
  "Builder",
  "Ops",
  "Legal",
  "Principal",
]);
export type ApprovalRole = z.infer<typeof ApprovalRole>;

export const SourceType = z.enum(["news", "regulatory", "court", "commentary", "other"]);
export type SourceType = z.infer<typeof SourceType>;

export const PrimarySecondary = z.enum(["primary", "secondary"]);
export type PrimarySecondary = z.infer<typeof PrimarySecondary>;

export const OutputType = z.enum(["public_draft", "internal_brief"]);
export type OutputType = z.infer<typeof OutputType>;

export const ApprovalAction = z.enum(["approve", "archive"]);
export type ApprovalAction = z.infer<typeof ApprovalAction>;
