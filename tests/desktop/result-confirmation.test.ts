import { describe, expect, it } from 'vitest';
import { resultConfirmationAttempt } from '../../apps/desktop/src/renderer/src/features/tasks/result-confirmation.js';

describe('Result confirmation retry state', () => {
  it('reuses one explicit confirmation key, invalidates it for a changed selection, and creates a new later confirmation', () => {
    let sequence = 0;
    const nextKey = () => `key-${++sequence}`;
    const first = resultConfirmationAttempt(['artifact-b', 'artifact-a'], undefined, nextKey);
    expect(first).toEqual({ artifactIds: ['artifact-a', 'artifact-b'], idempotencyKey: 'key-1' });
    expect(resultConfirmationAttempt(['artifact-a', 'artifact-b'], first, nextKey)).toBe(first);
    const changed = resultConfirmationAttempt(['artifact-a'], first, nextKey);
    expect(changed).toEqual({ artifactIds: ['artifact-a'], idempotencyKey: 'key-2' });
    expect(resultConfirmationAttempt(['artifact-a'], undefined, nextKey)).toEqual({ artifactIds: ['artifact-a'], idempotencyKey: 'key-3' });
  });
});
