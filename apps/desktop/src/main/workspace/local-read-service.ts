import { open, readdir, stat, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { resolveWithinWorkspace, validateRelativePath } from './path-policy.js';
import {
  localFailure,
  type DirectoryEntry,
  type DirectoryListing,
  type TextFile
} from './workspace-types.js';

const MAX_FILE_BYTES = 1024 * 1024;

export class LocalReadService {
  constructor(
    private readonly options: {
      openFile?: (path: string, flags: string) => Promise<FileHandle>;
    } = {}
  ) {}
  async listDirectory(
    root: string,
    relativePath = ''
  ): Promise<DirectoryListing> {
    validateRelativePath(relativePath, true);
    const target = await resolveWithinWorkspace(root, relativePath);
    let entries;
    try {
      entries = await readdir(target, { withFileTypes: true });
    } catch {
      localFailure('LOCAL_NOT_DIRECTORY', 'Workspace path is not a directory');
    }
    return {
      path: relativePath,
      entries: entries
        .map((entry): DirectoryEntry => ({
          name: entry.name,
          relativePath: path.posix.join(
            relativePath.replace(/\\/g, '/'),
            entry.name
          ),
          kind: entry.isSymbolicLink()
            ? 'SYMLINK'
            : entry.isDirectory()
              ? 'DIRECTORY'
              : 'FILE'
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    };
  }
  async readFile(root: string, relativePath: string): Promise<TextFile> {
    validateRelativePath(relativePath, false);
    const target = await resolveWithinWorkspace(root, relativePath);
    let info;
    try {
      info = await stat(target);
    } catch {
      localFailure('LOCAL_PATH_NOT_FOUND', 'Workspace path was not found');
    }
    if (!info.isFile())
      localFailure('LOCAL_NOT_FILE', 'Workspace path is not a file');
    if (info.size > MAX_FILE_BYTES)
      localFailure('LOCAL_FILE_TOO_LARGE', 'File exceeds the 1 MiB read limit');
    const handle = await (this.options.openFile ?? open)(target, 'r');
    try {
      const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
      let bytesRead = 0;
      while (bytesRead < buffer.length) {
        const result = await handle.read(
          buffer,
          bytesRead,
          buffer.length - bytesRead,
          bytesRead
        );
        if (result.bytesRead === 0) break;
        bytesRead += result.bytesRead;
      }
      if (bytesRead >= MAX_FILE_BYTES + 1)
        localFailure(
          'LOCAL_FILE_TOO_LARGE',
          'File exceeds the 1 MiB read limit'
        );
      const bytes = buffer.subarray(0, bytesRead);
      if (bytes.includes(0))
        localFailure(
          'LOCAL_BINARY_UNSUPPORTED',
          'Only UTF-8 text files are supported'
        );
      let content: string;
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        localFailure(
          'LOCAL_BINARY_UNSUPPORTED',
          'Only UTF-8 text files are supported'
        );
      }
      return { relativePath, content, size: bytesRead, encoding: 'utf-8' };
    } finally {
      await handle.close();
    }
  }
}
