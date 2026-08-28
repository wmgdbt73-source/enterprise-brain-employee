import { describe, expect, it } from 'vitest';
import { normalizeToolCompletion, normalizeToolRequest, normalizeWriteToolRequest } from '../../packages/contracts/src/index.js';

const request = (name: 'list_directory' | 'read_file', relativePath: string) => ({
  id: 'call-1',
  runId: 'run-1',
  userId: 'user-1',
  projectId: 'project-1',
  name,
  relativePath
});

describe('persisted ToolRequest and receipt runtime validation', () => {
  it('validates write_file receipt metadata against exact approved bytes metadata', () => {
    const write = { id: 'call-write', runId: 'run-1', userId: 'user-1', projectId: 'project-1', name: 'write_file' as const, relativePath: '你好😀.md', payloadSize: 10, payloadSha256: 'a'.repeat(64), effect: 'CREATE' as const, deviceId: 'device-1' };
    const valid = { toolCallId: 'call-write', status: 'SUCCEEDED' as const, metadata: { relativePath: '你好😀.md', size: 10, encoding: 'utf-8' as const, sha256: 'a'.repeat(64), effect: 'CREATE' as const } };
    expect(normalizeToolCompletion(write, valid)).toMatchObject({ kind: 'WRITE_FILE_SUCCESS' });
    for (const receipt of [{ ...valid, toolCallId: 'other' }, { ...valid, metadata: { ...valid.metadata, size: 9 } }, { ...valid, metadata: { ...valid.metadata, sha256: 'b'.repeat(64) } }, { ...valid, metadata: { ...valid.metadata, effect: 'REPLACE' as const } }, { ...valid, metadata: { ...valid.metadata, content: 'private' } }]) expect(normalizeToolCompletion(write, receipt)).toEqual({ kind: 'INVALID' });
  });
  it('strictly validates persisted write requests and CREATE/REPLACE preconditions', () => {
    const base = { id: 'call-write', runId: 'run-1', userId: 'user-1', projectId: 'project-1', name: 'write_file' as const, relativePath: 'doc.md', payloadSize: 0, payloadSha256: 'a'.repeat(64), effect: 'CREATE' as const, deviceId: 'device-1' };
    expect(normalizeWriteToolRequest(base)).toMatchObject({ name: 'write_file', effect: 'CREATE' });
    for (const request of [
      { ...base, id: '' }, { ...base, deviceId: '' }, { ...base, payloadSize: 1048577 },
      { ...base, payloadSha256: 'bad' }, { ...base, expectedCurrentSha256: 'b'.repeat(64) },
      { ...base, content: 'must-not-persist' }, { ...base, localPath: '/private' }
    ]) expect(normalizeWriteToolRequest(request)).toBeUndefined();
    expect(normalizeWriteToolRequest({ ...base, effect: 'REPLACE' })).toBeUndefined();
    expect(normalizeWriteToolRequest({ ...base, effect: 'REPLACE', expectedCurrentSha256: 'bad' })).toBeUndefined();
    expect(normalizeWriteToolRequest({ ...base, effect: 'REPLACE', expectedCurrentSha256: 'b'.repeat(64) })).toMatchObject({ effect: 'REPLACE' });
  });
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

  it('accepts only portable workspace-relative paths from untrusted persisted requests', () => {
    const receipt = {
      toolCallId: 'call-1', status: 'SUCCEEDED',
      metadata: { relativePath: ' docs/brief.md ', size: 1, encoding: 'utf-8', sha256: 'a'.repeat(64) }
    };
    const valid = request('read_file', ' docs/brief.md ');
    expect(normalizeToolRequest(valid)).toMatchObject({ relativePath: ' docs/brief.md ' });
    expect(normalizeToolCompletion(valid, receipt)).toMatchObject({ kind: 'READ_FILE_SUCCESS', relativePath: ' docs/brief.md ' });
    for (const relativePath of [
      '/etc/passwd', '\\Windows\\system32', '\\\\server\\share\\file',
      'C:\\temp\\file', 'C:relative-file', 'docs/../secret', 'docs\\..\\secret', 'safe\0file'
    ]) {
      const stored = request('read_file', relativePath);
      expect(normalizeToolRequest(stored)).toBeUndefined();
      expect(normalizeToolCompletion(stored, { ...receipt, metadata: { ...receipt.metadata, relativePath } })).toEqual({ kind: 'INVALID' });
    }
  });
});
