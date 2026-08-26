import type { LocalPermission } from '@enterprise-brain/contracts';

export interface WorkspaceBindingView {
  id: string;
  userId: string;
  projectId: string;
  localPath: string;
  permissions: LocalPermission[];
  createdAt: string;
  updatedAt: string;
}

export interface DirectoryEntry {
  name: string;
  relativePath: string;
  kind: 'FILE' | 'DIRECTORY' | 'SYMLINK';
}

export interface DirectoryListing {
  path: string;
  entries: DirectoryEntry[];
}

export interface TextFile {
  relativePath: string;
  content: string;
  size: number;
  encoding: 'utf-8';
}

export interface LocalCapabilityError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export class LocalCapabilityFailure extends Error {
  constructor(readonly error: LocalCapabilityError) {
    super(error.message);
  }
}

export function localFailure(code: string, message: string): never {
  throw new LocalCapabilityFailure({ code, message, details: {} });
}
