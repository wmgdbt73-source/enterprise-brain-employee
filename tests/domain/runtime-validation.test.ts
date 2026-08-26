import { describe, expect, it } from 'vitest';
import { normalizeToolCompletion } from '../../packages/contracts/src/index.js';

describe('persisted ToolRequest and receipt runtime validation', () => {
  it('preserves EB-008 read_file, list_directory, failed, and invalid semantics', () => {
    expect(
      normalizeToolCompletion(
        { name: 'list_directory', relativePath: '' },
        { status: 'SUCCEEDED', metadata: { relativePath: '', entryCount: 0 } }
      )
    ).toMatchObject({ kind: 'LIST_DIRECTORY_SUCCESS' });
    expect(
      normalizeToolCompletion(
        { name: 'read_file', relativePath: 'a.md' },
        {
          status: 'SUCCEEDED',
          metadata: {
            relativePath: 'a.md',
            size: 0,
            encoding: 'utf-8',
            sha256: 'a'.repeat(64)
          }
        }
      )
    ).toMatchObject({ kind: 'READ_FILE_SUCCESS' });
    expect(
      normalizeToolCompletion(
        { name: 'read_file', relativePath: 'a.md' },
        {
          status: 'FAILED',
          error: { code: 'LOCAL_IO_ERROR', message: 'failed', details: {} }
        }
      )
    ).toMatchObject({ kind: 'FAILED' });
    expect(
      normalizeToolCompletion(
        { name: 'read_file', relativePath: 'a.md' },
        {
          status: 'SUCCEEDED',
          metadata: {
            relativePath: 'other.md',
            size: 1,
            encoding: 'utf-8',
            sha256: 'a'.repeat(64)
          }
        }
      )
    ).toEqual({ kind: 'INVALID' });
  });
  it('treats persisted JSON as untrusted runtime data', () => {
    expect(normalizeToolCompletion(null, null)).toEqual({ kind: 'INVALID' });
    expect(
      normalizeToolCompletion({ name: 'unknown', relativePath: 'a' }, {})
    ).toEqual({ kind: 'INVALID' });
  });
});
