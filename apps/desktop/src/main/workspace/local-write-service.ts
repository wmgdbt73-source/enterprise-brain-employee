import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { localFailure } from './workspace-types.js';

export const MAX_WRITE_BYTES = 1024 * 1024;
export type PreparedWrite = { relativePath: string; payloadSize: number; payloadSha256: string; effect: 'CREATE' | 'REPLACE'; expectedCurrentSha256?: string; bytes: Buffer };

/** Main-process-only writer. Its inputs are an approved metadata grant plus locally retained bytes. */
export class LocalWriteService {
  async prepare(root: string, relativePath: string, content: string): Promise<PreparedWrite> {
    const bytes = Buffer.from(content, 'utf8');
    if (bytes.length > MAX_WRITE_BYTES || bytes.includes(0)) localFailure('LOCAL_WRITE_PRECONDITION_FAILED', 'Only UTF-8 text up to 1 MiB is supported');
    const { target } = await resolveTarget(root, relativePath);
    try {
      const info = await lstat(target);
      if (!info.isFile() || info.isSymbolicLink()) localFailure('LOCAL_WRITE_PRECONDITION_FAILED', 'Write target is not a regular file');
      return { relativePath, payloadSize: bytes.length, payloadSha256: sha(bytes), effect: 'REPLACE', expectedCurrentSha256: sha(await readFile(target)), bytes };
    } catch (error) {
      if (!isNotFound(error)) throw error;
      return { relativePath, payloadSize: bytes.length, payloadSha256: sha(bytes), effect: 'CREATE', bytes };
    }
  }

  async execute(root: string, approved: Omit<PreparedWrite, 'bytes'>, content: string): Promise<void> {
    const prepared = await this.prepare(root, approved.relativePath, content);
    if (prepared.payloadSize !== approved.payloadSize || prepared.payloadSha256 !== approved.payloadSha256 || prepared.effect !== approved.effect || prepared.expectedCurrentSha256 !== approved.expectedCurrentSha256)
      localFailure('LOCAL_WRITE_PRECONDITION_FAILED', 'Approved write precondition changed');
    const { target } = await resolveTarget(root, approved.relativePath);
    if (approved.effect === 'CREATE') {
      try { await writeFile(target, prepared.bytes, { flag: 'wx' }); }
      catch (error) { if (isExists(error)) localFailure('LOCAL_WRITE_PRECONDITION_FAILED', 'Create target already exists'); localFailure('LOCAL_IO_ERROR', 'Local write failed'); }
      return;
    }
    const temp = path.join(path.dirname(target), `.${path.basename(target)}.enterprise-brain-${randomUUID()}.tmp`);
    try { await writeFile(temp, prepared.bytes, { flag: 'wx' }); await rename(temp, target); }
    catch { await rm(temp, { force: true }).catch(() => undefined); localFailure('LOCAL_IO_ERROR', 'Local write failed'); }
  }
}

async function resolveTarget(root: string, relativePath: string) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('\0') || relativePath.split(/[\\/]+/).includes('..')) localFailure('LOCAL_PATH_OUTSIDE_WORKSPACE', 'Invalid workspace path');
  const canonicalRoot = await realpath(root);
  const target = path.resolve(canonicalRoot, relativePath);
  if (!within(canonicalRoot, target)) localFailure('LOCAL_PATH_OUTSIDE_WORKSPACE', 'Path is outside the workspace');
  const parent = await realpath(path.dirname(target)).catch(() => localFailure('LOCAL_PATH_NOT_FOUND', 'Parent directory was not found'));
  if (!within(canonicalRoot, parent)) localFailure('LOCAL_PATH_OUTSIDE_WORKSPACE', 'Path is outside the workspace');
  return { target };
}
function sha(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function within(root: string, target: string): boolean { const relative = path.relative(root, target); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); }
function isNotFound(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT'; }
function isExists(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'EEXIST'; }
