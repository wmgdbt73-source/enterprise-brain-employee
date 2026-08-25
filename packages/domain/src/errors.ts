export type DomainErrorCode =
  | 'INVALID_ARGUMENT'
  | 'INVALID_STATE_TRANSITION'
  | 'PROJECT_MEMBERSHIP_REQUIRED'
  | 'DUPLICATE_PROJECT_MEMBER'
  | 'OWNER_ALREADY_EXISTS';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Readonly<Record<string, string>>;

  constructor(
    code: DomainErrorCode,
    message: string,
    details: Record<string, string> = {}
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function requireNonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new DomainError('INVALID_ARGUMENT', `${field} must not be blank`, {
      field
    });
  }

  return normalized;
}
