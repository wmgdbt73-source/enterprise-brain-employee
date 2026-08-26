import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { localFailure } from './workspace-types.js';

export function validateRelativePath(
  relativePath: string,
  allowEmpty: boolean
): void {
  if (typeof relativePath !== 'string' || relativePath.includes('\0'))
    localFailure('LOCAL_PATH_OUTSIDE_WORKSPACE', 'Invalid workspace path');
  if (relativePath === '') {
    if (allowEmpty) return;
    localFailure('LOCAL_NOT_FILE', 'A file path is required');
  }
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]+/).some((part) => part === '..')
  )
    localFailure(
      'LOCAL_PATH_OUTSIDE_WORKSPACE',
      'Path is outside the workspace'
    );
}

export async function resolveWithinWorkspace(
  root: string,
  relativePath: string
): Promise<string> {
  const canonicalRoot = await realpath(root);
  const candidate = path.resolve(canonicalRoot, relativePath);
  let target: string;
  try {
    target = await realpath(candidate);
  } catch {
    localFailure('LOCAL_PATH_NOT_FOUND', 'Workspace path was not found');
  }
  const relationship = path.relative(canonicalRoot, target);
  if (
    relationship === '..' ||
    relationship.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relationship)
  )
    localFailure(
      'LOCAL_PATH_OUTSIDE_WORKSPACE',
      'Path is outside the workspace'
    );
  return target;
}
