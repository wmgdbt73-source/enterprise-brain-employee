import { expect } from 'vitest';
import {
  DomainError,
  type DomainErrorCode
} from '../../packages/domain/src/index.js';

export function expectDomainError(
  action: () => unknown,
  code: DomainErrorCode
): void {
  try {
    action();
    throw new Error('Expected a DomainError');
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code });
  }
}
