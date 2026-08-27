import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { localFailure } from './workspace-types.js';

const MAX_BYTES = 1024 * 1024;
export type PreparedWrite = { relativePath: string; payloadSize: number; payloadSha256: string; effect: 'CREATE' | 'REPLACE'; expectedCurrentSha256?: string; bytes: Buffer };
export class LocalWriteService {
  async prepare(root: string, relativePath: string, content: string): Promise<PreparedWrite> {
    if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('\0') || relativePath.split(/[\\/]+/).includes('..')) localFailure('LOCAL_PATH_OUTSIDE_WORKSPACE', 'Invalid workspace path');
    const bytes = Buffer.from(content, 'utf8');
    if (bytes.length > MAX_BYTES || bytes.includes(0)) localFailure('LOCAL_WRITE_PRECONDITION_FAILED', 'Only UTF-8 text up to 1 MiB is supported');
    const canonicalRoot = await realpath(root);
    const target = path.resolve(canonicalRoot, relativePath);
    if (!within(canonicalRoot, target)) localFailure('LOCAL_PATH_OUTSIDE_WORKSPACE', 'Path is outside the workspace');
    const parent = await realpath(path.dirname(target)).catch(() => localFailure('LOCAL_PATH_NOT_FOUND', 'Parent directory was not found'));
    if (!within(canonicalRoot, parent)) localFailure('LOCAL_PATH_OUTSIDE_WORKSPACE', 'Path is outside the workspace');
    const hash = sha(bytes);
    try {
      const info = await lstat(target);
      if (!info.isFile() || info.isSymbolicLink()) localFailure('LOCAL_WRITE_PRECONDITION_FAILED', 'Write target is not a regular file');
      return { relativePath, payloadSize: bytes.length, payloadSha256: hash, effect: 'REPLACE', expectedCurrentSha256: sha(await readFile(target)), bytes };
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT')) throw error;
      return { relativePath, payloadSize: bytes.length, payloadSha256: hash, effect: 'CREATE', bytes };
    }
  }
  async execute(root: string, approved: Omit<PreparedWrite, 'bytes'>, content: string): Promise<void> {
    const prepared = await this.prepare(root, approved.relativePath, content);
    if (prepared.payloadSize !== approved.payloadSize || prepared.payloadSha256 !== approved.payloadSha256 || prepared.effect !== approved.effect || prepared.expectedCurrentSha256 !== approved.expectedCurrentSha256) localFailure('LOCAL_WRITE_PRECONDITION_FAILED', 'Approved write precondition changed');
    const target = path.resolve(await realpath(root), approved.relativePath);
    const temp = `${target}.enterprise-brain-${randomUUID()}.tmp`;
    try { await writeFile(temp, prepared.bytes, { flag: 'wx' }); await rename(temp, target); } catch { await rm(temp, { force: true }).catch(() => undefined); localFailure('LOCAL_IO_ERROR', 'Local write failed'); }
  }
}
function sha(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function within(root: string, target: string): boolean { const r = path.relative(root, target); return r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r); }
