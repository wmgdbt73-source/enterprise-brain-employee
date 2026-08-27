import type { ApprovedWriteExecutionGrant } from '@enterprise-brain/contracts';

/** One-shot Main-process-only grants. Nothing in this class crosses the preload boundary. */
export class ApprovedWriteExecutionGrantStore {
  private readonly grants = new Map<string, ApprovedWriteExecutionGrant>();
  put(grant: ApprovedWriteExecutionGrant): void { this.grants.set(grant.toolCallId, grant); }
  take(toolCallId: string): ApprovedWriteExecutionGrant | undefined {
    const value = this.grants.get(toolCallId);
    this.grants.delete(toolCallId);
    return value;
  }
}
