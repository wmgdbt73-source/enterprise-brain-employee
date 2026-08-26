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
  | {
      kind: 'FAILED';
      error: { code: string; message: string; details: Record<string, never> };
    }
  | { kind: 'INVALID' };

export function normalizeToolCompletion(
  request: unknown,
  receipt: unknown
): NormalizedToolCompletion {
  if (!isRecord(request) || !isRecord(receipt)) return { kind: 'INVALID' };
  const name = request.name;
  const requestedPath = request.relativePath;
  if (
    (name !== 'list_directory' && name !== 'read_file') ||
    typeof requestedPath !== 'string'
  )
    return { kind: 'INVALID' };
  if (receipt.status === 'FAILED') {
    const error = receipt.error;
    if (
      !isRecord(error) ||
      typeof error.code !== 'string' ||
      typeof error.message !== 'string' ||
      !isEmptyRecord(error.details)
    )
      return { kind: 'INVALID' };
    return {
      kind: 'FAILED',
      error: { code: error.code, message: error.message, details: {} }
    };
  }
  if (receipt.status !== 'SUCCEEDED' || !isRecord(receipt.metadata))
    return { kind: 'INVALID' };
  const metadata = receipt.metadata;
  if (metadata.relativePath !== requestedPath) return { kind: 'INVALID' };
  if (
    name === 'list_directory' &&
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
  if (
    name === 'read_file' &&
    typeof requestedPath === 'string' &&
    requestedPath.length > 0 &&
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
  return { kind: 'INVALID' };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isEmptyRecord(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 0;
}
