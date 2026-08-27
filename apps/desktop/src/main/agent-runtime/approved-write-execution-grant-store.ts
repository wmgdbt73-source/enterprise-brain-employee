import type { ApprovedWriteExecutionGrant } from '@enterprise-brain/contracts';

/** One-shot Main-process-only grants. Nothing in this class crosses the preload boundary. */
export class ApprovedWriteExecutionGrantStore {
  private readonly grants = new Map<string, ApprovedWriteExecutionGrant>();
  private readonly consumed = new Set<string>();
  put(grant: ApprovedWriteExecutionGrant): boolean {
    if (this.consumed.has(grant.toolCallId)) return false;
    this.grants.set(grant.toolCallId, grant);
    return true;
  }
  take(toolCallId: string): ApprovedWriteExecutionGrant | undefined {
    if (this.consumed.has(toolCallId)) return undefined;
    const value = this.grants.get(toolCallId);
    this.grants.delete(toolCallId);
    if (value) this.consumed.add(toolCallId);
    return value;
  }
}
