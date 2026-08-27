/** Runtime validation for untrusted persisted ToolRequest and ToolCall receipt JSON. */
export type NormalizedWriteToolRequest = {
  id: string; runId: string; userId: string; projectId: string; name: 'write_file';
  relativePath: string; deviceId: string; payloadSize: number; payloadSha256: string;
  effect: 'CREATE' | 'REPLACE'; expectedCurrentSha256?: string;
};
export type NormalizedToolCompletion =
  | { kind: 'LIST_DIRECTORY_SUCCESS'; relativePath: string; entryCount: number }
  | { kind: 'READ_FILE_SUCCESS'; relativePath: string; size: number; encoding: 'utf-8'; sha256: string }
  | { kind: 'WRITE_FILE_SUCCESS'; relativePath: string; size: number; encoding: 'utf-8'; sha256: string; effect: 'CREATE' | 'REPLACE' }
  | { kind: 'FAILED'; error: { code: string; message: string; details: Record<string, never> } }
  | { kind: 'INVALID' };

/** Validates the complete persisted write request; TypeScript types never make JSON trustworthy. */
export function normalizeWriteToolRequest(request: unknown): NormalizedWriteToolRequest | undefined {
  if (!isRecord(request) || !hasOnlyKeys(request, writeRequestKeys)) return undefined;
  if (!isNonBlankString(request.id) || !isNonBlankString(request.runId) || !isNonBlankString(request.userId) ||
      !isNonBlankString(request.projectId) || request.name !== 'write_file' || !isNonBlankString(request.relativePath) ||
      !isNonBlankString(request.deviceId) || !isNonNegativeInteger(request.payloadSize) || request.payloadSize > MAX_WRITE_PAYLOAD_BYTES || !isSha256(request.payloadSha256) ||
      (request.effect !== 'CREATE' && request.effect !== 'REPLACE')) return undefined;
  const hasExpected = Object.prototype.hasOwnProperty.call(request, 'expectedCurrentSha256');
  if (request.effect === 'CREATE' && hasExpected) return undefined;
  if (request.effect === 'REPLACE' && (!hasExpected || !isSha256(request.expectedCurrentSha256))) return undefined;
  return { id: request.id, runId: request.runId, userId: request.userId, projectId: request.projectId,
    name: 'write_file', relativePath: request.relativePath, deviceId: request.deviceId,
    payloadSize: request.payloadSize, payloadSha256: request.payloadSha256, effect: request.effect,
    ...(request.effect === 'REPLACE' ? { expectedCurrentSha256: request.expectedCurrentSha256 as string } : {}) };
}

export function normalizeToolCompletion(request: unknown, receipt: unknown): NormalizedToolCompletion {
  if (!isRecord(request) || !isRecord(receipt)) return invalid();
  const writeRequest = request.name === 'write_file' ? normalizeWriteToolRequest(request) : undefined;
  if (!(hasOnlyKeys(request, basicRequestKeys) || writeRequest) || !isNonBlankString(request.id) ||
      !isNonBlankString(request.runId) || !isNonBlankString(request.userId) || !isNonBlankString(request.projectId) ||
      (request.name !== 'list_directory' && request.name !== 'read_file' && request.name !== 'write_file') ||
      typeof request.relativePath !== 'string' || !isNonBlankString(receipt.toolCallId) || receipt.toolCallId !== request.id) return invalid();
  if (receipt.status === 'FAILED') {
    const error = receipt.error;
    return hasOnlyKeys(receipt, failedReceiptKeys) && isRecord(error) && hasOnlyKeys(error, failedErrorKeys) &&
      isNonBlankString(error.code) && isNonBlankString(error.message) && isEmptyRecord(error.details)
      ? { kind: 'FAILED', error: { code: error.code, message: error.message, details: {} } } : invalid();
  }
  if (receipt.status !== 'SUCCEEDED' || !hasOnlyKeys(receipt, successReceiptKeys) || !isRecord(receipt.metadata)) return invalid();
  const metadata = receipt.metadata;
  if (metadata.relativePath !== request.relativePath) return invalid();
  if (request.name === 'list_directory' && hasOnlyKeys(metadata, directoryMetadataKeys) && isNonNegativeInteger(metadata.entryCount))
    return { kind: 'LIST_DIRECTORY_SUCCESS', relativePath: request.relativePath, entryCount: metadata.entryCount };
  if (request.name === 'read_file' && isNonBlankString(request.relativePath) && hasOnlyKeys(metadata, fileMetadataKeys) &&
      isNonNegativeInteger(metadata.size) && metadata.encoding === 'utf-8' && isSha256(metadata.sha256))
    return { kind: 'READ_FILE_SUCCESS', relativePath: request.relativePath, size: metadata.size, encoding: 'utf-8', sha256: metadata.sha256 };
  if (writeRequest && hasOnlyKeys(metadata, writeMetadataKeys) && isNonNegativeInteger(metadata.size) &&
      metadata.size === writeRequest.payloadSize && metadata.encoding === 'utf-8' && metadata.sha256 === writeRequest.payloadSha256 && isEffect(metadata.effect) && metadata.effect === writeRequest.effect)
    return { kind: 'WRITE_FILE_SUCCESS', relativePath: writeRequest.relativePath, size: metadata.size, encoding: 'utf-8', sha256: metadata.sha256, effect: metadata.effect };
  return invalid();
}

export const MAX_WRITE_PAYLOAD_BYTES = 1024 * 1024;
const basicRequestKeys = ['id', 'runId', 'userId', 'projectId', 'name', 'relativePath'];
const writeRequestKeys = [...basicRequestKeys, 'deviceId', 'payloadSize', 'payloadSha256', 'effect', 'expectedCurrentSha256'];
const successReceiptKeys = ['toolCallId', 'status', 'metadata'];
const failedReceiptKeys = ['toolCallId', 'status', 'error'];
const directoryMetadataKeys = ['relativePath', 'entryCount'];
const fileMetadataKeys = ['relativePath', 'size', 'encoding', 'sha256'];
const writeMetadataKeys = ['relativePath', 'size', 'encoding', 'sha256', 'effect'];
const failedErrorKeys = ['code', 'message', 'details'];
function invalid(): NormalizedToolCompletion { return { kind: 'INVALID' }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isEmptyRecord(value: unknown): boolean { return isRecord(value) && Object.keys(value).length === 0; }
function isNonBlankString(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function isSha256(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value); }
function isNonNegativeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0; }
function isEffect(value: unknown): value is 'CREATE' | 'REPLACE' { return value === 'CREATE' || value === 'REPLACE'; }
function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) { return Object.keys(value).every(key => allowed.includes(key)); }
