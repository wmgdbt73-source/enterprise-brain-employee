export type PendingWritePayload = {
  confirmationId: string; agentRunId: string; toolCallId: string; userId: string; projectId: string; taskId: string;
  deviceId: string; relativePath: string; payloadSize: number; payloadSha256: string;
  effect: 'CREATE' | 'REPLACE'; expectedCurrentSha256?: string; content: string;
};
/** Ephemeral, Main-process-only employee payloads. Content and provenance never cross preload. */
export class PendingWritePayloadStore {
  private readonly payloads = new Map<string, PendingWritePayload>();
  put(payload: PendingWritePayload): void { this.payloads.set(payload.confirmationId, payload); }
  get(confirmationId: string): PendingWritePayload | undefined { return this.payloads.get(confirmationId); }
  take(confirmationId: string): PendingWritePayload | undefined { const value = this.payloads.get(confirmationId); this.payloads.delete(confirmationId); return value; }
  remove(confirmationId: string): void { this.payloads.delete(confirmationId); }
}
