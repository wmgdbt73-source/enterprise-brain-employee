import type { AccountStatus } from './auth.js';

export type AuditSource = 'ADMIN_API' | 'SYSTEM';
export interface AuditEventContract {
  id: string; organizationId: string; actorUserId: string; actorDisplayName: string; actorEmail?: string;
  action: string; subjectType: string; subjectId?: string; resourceType: string; resourceId?: string;
  before?: Record<string, unknown>; after?: Record<string, unknown>; reason?: string; source: AuditSource; requestId?: string; createdAt: string;
}
export interface AuditEventListContract { items: AuditEventContract[]; nextCursor?: string; }
export interface AccountStatusChangeRequest { status: AccountStatus; reason: string; }
export interface AccountStatusChangeContract { userId: string; status: AccountStatus; }
