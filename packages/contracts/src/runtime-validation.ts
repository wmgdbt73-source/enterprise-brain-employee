/** Runtime validation for untrusted persisted ToolRequest and ToolCall receipt JSON. */
export type NormalizedToolCompletion =
  | { kind: 'LIST_DIRECTORY_SUCCESS'; relativePath: string; entryCount: number }
  | {
      kind: 'READ_FILE_SUCCESS';
      relativePath: string;
      size: number;
      encoding: 'utf-8';
      sha256: string;
    }
  | { kind: 'WRITE_FILE_SUCCESS'; relativePath: string; size: number; encoding: 'utf-8'; sha256: string; effect: 'CREATE' | 'REPLACE' }
  | {
      kind: 'FAILED';
      error: { code: string; message: string; details: Record<string, never> };
    }
  | { kind: 'INVALID' };

export function normalizeToolCompletion(
  request: unknown,
  receipt: unknown
): NormalizedToolCompletion {
  if (!isRecord(request) || !(hasOnlyKeys(request, requestKeys) || isWriteRequest(request))) return invalid();
  const name = request.name;
  const requestedPath = request.relativePath;
  if (
    !isNonBlankString(request.id) ||
    !isNonBlankString(request.runId) ||
    !isNonBlankString(request.userId) ||
    !isNonBlankString(request.projectId) ||
    (name !== 'list_directory' && name !== 'read_file' && name !== 'write_file') ||
    typeof requestedPath !== 'string' ||
    !isRecord(receipt) ||
    !isNonBlankString(receipt.toolCallId) ||
    receipt.toolCallId !== request.id
  )
    return invalid();
  if (receipt.status === 'FAILED') {
    const error = receipt.error;
    if (
      !hasOnlyKeys(receipt, failedReceiptKeys) ||
      !isRecord(error) ||
      !hasOnlyKeys(error, failedErrorKeys) ||
      !isNonBlankString(error.code) ||
      !isNonBlankString(error.message) ||
      !isEmptyRecord(error.details)
    )
      return invalid();
    return {
      kind: 'FAILED',
      error: { code: error.code, message: error.message, details: {} }
    };
  }
  if (
    receipt.status !== 'SUCCEEDED' ||
    !hasOnlyKeys(receipt, successReceiptKeys) ||
    !isRecord(receipt.metadata)
  )
    return invalid();
  const metadata = receipt.metadata;
  if (metadata.relativePath !== requestedPath) return { kind: 'INVALID' };
  if (
    name === 'list_directory' &&
    hasOnlyKeys(metadata, directoryMetadataKeys) &&
    Number.isInteger(metadata.entryCount) &&
    (metadata.entryCount as number) >= 0 &&
    metadata.size === undefined &&
    metadata.encoding === undefined &&
    metadata.sha256 === undefined
  )
    return {
      kind: 'LIST_DIRECTORY_SUCCESS',
      relativePath: requestedPath,
      entryCount: metadata.entryCount as number
    };
  if (name === 'write_file' && hasOnlyKeys(metadata, writeMetadataKeys) && typeof requestedPath === 'string' && requestedPath.length > 0 && Number.isInteger(metadata.size) && (metadata.size as number) >= 0 && metadata.encoding === 'utf-8' && typeof metadata.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(metadata.sha256) && (metadata.effect === 'CREATE' || metadata.effect === 'REPLACE') && isWriteRequest(request) && metadata.size === request.payloadSize && metadata.sha256 === request.payloadSha256 && metadata.effect === request.effect)
    return { kind: 'WRITE_FILE_SUCCESS', relativePath: requestedPath, size: metadata.size as number, encoding: 'utf-8', sha256: metadata.sha256, effect: metadata.effect };
  if (
    name === 'read_file' &&
    typeof requestedPath === 'string' &&
    requestedPath.length > 0 &&
    hasOnlyKeys(metadata, fileMetadataKeys) &&
    Number.isInteger(metadata.size) &&
    (metadata.size as number) >= 0 &&
    metadata.encoding === 'utf-8' &&
    typeof metadata.sha256 === 'string' &&
    /^[a-f0-9]{64}$/i.test(metadata.sha256) &&
    metadata.entryCount === undefined
  )
    return {
      kind: 'READ_FILE_SUCCESS',
      relativePath: requestedPath,
      size: metadata.size as number,
      encoding: 'utf-8',
      sha256: metadata.sha256
    };
  return invalid();
}
const requestKeys = ['id', 'runId', 'userId', 'projectId', 'name', 'relativePath'];
const successReceiptKeys = ['toolCallId', 'status', 'metadata'];
const failedReceiptKeys = ['toolCallId', 'status', 'error'];
const directoryMetadataKeys = ['relativePath', 'entryCount'];
const fileMetadataKeys = ['relativePath', 'size', 'encoding', 'sha256'];
const writeMetadataKeys = ['relativePath', 'size', 'encoding', 'sha256', 'effect'];
const failedErrorKeys = ['code', 'message', 'details'];
function invalid(): NormalizedToolCompletion {
  return { kind: 'INVALID' };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isEmptyRecord(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 0;
}
function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function isWriteRequest(value: Record<string, unknown>): value is Record<string, unknown> & { payloadSize: number; payloadSha256: string; effect: 'CREATE' | 'REPLACE'; deviceId: string } {
  return hasOnlyKeys(value, [...requestKeys, 'payloadSize', 'payloadSha256', 'effect', 'expectedCurrentSha256', 'deviceId']) && Number.isInteger(value.payloadSize) && (value.payloadSize as number) >= 0 && typeof value.payloadSha256 === 'string' && /^[a-f0-9]{64}$/i.test(value.payloadSha256) && (value.effect === 'CREATE' || value.effect === 'REPLACE') && isNonBlankString(value.deviceId);
}
