import { describe, expect, it } from 'vitest';
import { normalizeToolCompletion } from '../../packages/contracts/src/index.js';

const request = (name: 'list_directory' | 'read_file', relativePath: string) => ({
  id: 'call-1',
  runId: 'run-1',
  userId: 'user-1',
  projectId: 'project-1',
  name,
  relativePath
});

describe('persisted ToolRequest and receipt runtime validation', () => {
  it('preserves valid EB-008 read_file, list_directory, and failed semantics', () => {
    expect(
      normalizeToolCompletion(request('list_directory', ''), {
        toolCallId: 'call-1',
        status: 'SUCCEEDED',
        metadata: { relativePath: '', entryCount: 0 }
      })
    ).toMatchObject({ kind: 'LIST_DIRECTORY_SUCCESS' });
    expect(
      normalizeToolCompletion(request('read_file', 'a.md'), {
        toolCallId: 'call-1',
        status: 'SUCCEEDED',
        metadata: {
          relativePath: 'a.md',
          size: 0,
          encoding: 'utf-8',
          sha256: 'a'.repeat(64)
        }
      })
    ).toMatchObject({ kind: 'READ_FILE_SUCCESS' });
    expect(
      normalizeToolCompletion(request('read_file', 'a.md'), {
        toolCallId: 'call-1',
        status: 'FAILED',
        error: { code: 'LOCAL_IO_ERROR', message: 'failed', details: {} }
      })
    ).toMatchObject({ kind: 'FAILED' });
  });

  it('rejects malformed identifiers, mismatches, and unapproved persisted fields', () => {
    const valid = request('read_file', 'a.md');
    const receipt = {
      toolCallId: 'call-1',
      status: 'SUCCEEDED',
      metadata: {
        relativePath: 'a.md',
        size: 1,
        encoding: 'utf-8',
        sha256: 'a'.repeat(64)
      }
    };
    for (const [storedRequest, storedReceipt] of [
      [null, null],
      [{ ...valid, id: '' }, receipt],
      [valid, { ...receipt, toolCallId: 'other' }],
      [valid, { ...receipt, toolCallId: '' }],
      [valid, { ...receipt, content: 'private' }],
      [valid, { ...receipt, metadata: { ...receipt.metadata, localPath: '/private' } }],
      [valid, { ...receipt, metadata: { ...receipt.metadata, stack: 'stack' } }],
      [valid, { ...receipt, metadata: { ...receipt.metadata, errno: 'EACCES' } }],
      [valid, { ...receipt, metadata: { ...receipt.metadata, entries: [] } }],
      [
        valid,
        {
          toolCallId: 'call-1',
          status: 'FAILED',
          error: {
            code: 'LOCAL_IO_ERROR',
            message: 'failed',
            details: {},
            stack: 'private'
          }
        }
      ]
    ]) {
      expect(normalizeToolCompletion(storedRequest, storedReceipt)).toEqual({
        kind: 'INVALID'
      });
    }
  });
});
