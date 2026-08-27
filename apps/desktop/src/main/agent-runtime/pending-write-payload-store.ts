/** Ephemeral, Main-process-only employee payloads. Content is neither persisted nor exposed via preload. */
export class PendingWritePayloadStore {
  private readonly payloads = new Map<string, { content: string }>();
  put(toolCallId: string, content: string): void { this.payloads.set(toolCallId, { content }); }
  take(toolCallId: string): { content: string } | undefined {
    const value = this.payloads.get(toolCallId);
    this.payloads.delete(toolCallId);
    return value;
  }
  remove(toolCallId: string): void { this.payloads.delete(toolCallId); }
}
