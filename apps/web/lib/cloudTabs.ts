export type CloudTabRole = "owner" | "member" | "viewer";
export type CloudTabStatus = "open" | "frozen" | "signing" | "settling" | "verified_settled" | "failed";
export type ParticipantInviteStatus = "draft" | "invited" | "joined" | "declined" | "revoked";
export type DebtorApprovalStatus = "pending" | "signed" | "rejected" | "expired" | "revoked";

export interface CloudTabSummary {
  id: string;
  title: string;
  currency: string;
  status: CloudTabStatus;
  role: CloudTabRole;
  participantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CloudParticipant {
  id: string;
  displayName: string;
  walletAddress: `0x${string}` | null;
  userId: string | null;
  inviteStatus: ParticipantInviteStatus;
  inviteExpiresAt: string | null;
}

export interface CloudApproval {
  id: string;
  participantId: string;
  userId: string | null;
  walletAddress: `0x${string}`;
  planHash: `0x${string}`;
  debitMinor: string;
  status: DebtorApprovalStatus;
  expiresAt: string;
  signedAt: string | null;
  updatedAt: string;
}

export interface CloudAuditEvent {
  id: string;
  actorId: string | null;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CloudTabDetail extends CloudTabSummary {
  ownerId: string;
  payerParticipantId: string | null;
  currentUserId: string;
  participants: CloudParticipant[];
  approvals: CloudApproval[];
  audit: CloudAuditEvent[];
}

export type CloudAvailability = "loading" | "disabled" | "signed-out" | "ready" | "error";
