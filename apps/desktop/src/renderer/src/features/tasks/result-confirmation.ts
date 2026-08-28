export interface ResultConfirmationAttempt {
  readonly artifactIds: readonly string[];
  readonly idempotencyKey: string;
}

/**
 * A confirmation attempt is stable only for its exact Artifact set. Retrying
 * that explicit confirmation reuses its key; changing the selection creates a
 * new explicit confirmation and therefore a new key.
 */
export function resultConfirmationAttempt(
  artifactIds: readonly string[],
  previous: ResultConfirmationAttempt | undefined,
  createKey: () => string
): ResultConfirmationAttempt {
  const canonical = [...artifactIds].sort(compareIds);
  if (
    previous &&
    previous.artifactIds.length === canonical.length &&
    previous.artifactIds.every((id, index) => id === canonical[index])
  ) {
    return previous;
  }
  return { artifactIds: canonical, idempotencyKey: createKey() };
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
