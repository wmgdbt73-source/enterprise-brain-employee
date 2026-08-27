import { randomUUID } from 'node:crypto';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  asDeviceId,
  asProjectId,
  asUserId,
  asWorkspaceBindingId,
  createWorkspaceBinding
} from '../../packages/domain/src/index.js';
import { DeviceIdStore } from '../../apps/desktop/src/main/workspace/device-id-store.js';
import { LocalReadService } from '../../apps/desktop/src/main/workspace/local-read-service.js';
import { LocalCapabilityFailure } from '../../apps/desktop/src/main/workspace/workspace-types.js';
import { WorkspaceStore } from '../../apps/desktop/src/main/workspace/workspace-store.js';
import { WorkspaceService } from '../../apps/desktop/src/main/workspace/workspace-service.js';
import { LocalWriteService } from '../../apps/desktop/src/main/workspace/local-write-service.js';

const directories: string[] = [];
async function createTemp() {
  const directory = path.join(os.tmpdir(), `eb-workspace-${randomUUID()}`);
  await mkdir(directory);
  directories.push(directory);
  return directory;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) =>
        import('node:fs/promises').then(({ rm }) =>
          rm(directory, { recursive: true, force: true })
        )
      )
  );
});

function failureCode(error: unknown) {
  expect(error).toBeInstanceOf(LocalCapabilityFailure);
  return (error as LocalCapabilityFailure).error.code;
}

describe('device-local workspace read capabilities', () => {
  it('writes confirmed CREATE exclusively and rejects traversal or stale REPLACE targets', async () => {
    const root = await createTemp();
    await mkdir(path.join(root, 'docs'));
    const writer = new LocalWriteService();
    const create = await writer.prepare(root, 'docs/new.md', '你好😀');
    await writer.execute(root, create, '你好😀');
    expect(await import('node:fs/promises').then(({ readFile }) => readFile(path.join(root, 'docs/new.md'), 'utf8'))).toBe('你好😀');
    await expect(writer.execute(root, create, '你好😀')).rejects.toSatisfy(error => failureCode(error) === 'LOCAL_WRITE_PRECONDITION_FAILED');
    const replace = await writer.prepare(root, 'docs/new.md', 'replacement');
    await writeFile(path.join(root, 'docs/new.md'), 'changed');
    await expect(writer.execute(root, replace, 'replacement')).rejects.toSatisfy(error => failureCode(error) === 'LOCAL_WRITE_PRECONDITION_FAILED');
    await expect(writer.prepare(root, '../escape.md', 'x')).rejects.toSatisfy(error => failureCode(error) === 'LOCAL_PATH_OUTSIDE_WORKSPACE');
  });
  it('persists a stable DeviceId and one binding per user/project/device', async () => {
    const directory = await createTemp();
    const first = await new DeviceIdStore(directory).get();
    expect(await new DeviceIdStore(directory).get()).toBe(first);
    const store = new WorkspaceStore(directory);
    const binding = createWorkspaceBinding(
      {
        id: asWorkspaceBindingId('binding'),
        userId: asUserId('user'),
        projectId: asProjectId('project'),
        deviceId: first,
        localPath: directory,
        permissions: ['LOCAL_READ']
      },
      new Date()
    );
    await Promise.all([
      store.upsert(binding),
      store.upsert({
        ...binding,
        id: asWorkspaceBindingId('replacement'),
        updatedAt: new Date()
      })
    ]);
    expect(await store.get('user', 'project', first)).toMatchObject({
      id: 'replacement'
    });
    expect(
      await new WorkspaceStore(directory).get('user', 'project', first)
    ).toMatchObject({ id: 'replacement', createdAt: expect.any(Date) });
  });
  it('fails safely for corrupted DeviceId and WorkspaceBinding metadata', async () => {
    const directory = await createTemp();
    await writeFile(
      path.join(directory, 'device-id.json'),
      JSON.stringify({ version: 1, deviceId: 'not-a-uuid' })
    );
    await expect(new DeviceIdStore(directory).get()).rejects.toThrow(
      'Device identity metadata is invalid'
    );
    await writeFile(
      path.join(directory, 'workspace-bindings.json'),
      JSON.stringify({
        version: 1,
        bindings: [
          {
            id: 'binding',
            userId: 'user',
            projectId: 'project',
            deviceId: 'device',
            localPath: '',
            permissions: ['LOCAL_MODIFY'],
            createdAt: 'bad',
            updatedAt: 'bad'
          }
        ]
      })
    );
    await expect(
      new WorkspaceStore(directory).get('user', 'project', 'device')
    ).rejects.toThrow();
  });
  it('lists and reads in-root UTF-8 files but rejects invalid inputs and file kinds', async () => {
    const root = await createTemp();
    await mkdir(path.join(root, 'docs'));
    await writeFile(path.join(root, 'docs', 'readme.md'), 'hello');
    await writeFile(path.join(root, 'binary.bin'), Buffer.from([0, 1]));
    await writeFile(
      path.join(root, 'invalid-utf8.txt'),
      Buffer.from([0xc3, 0x28])
    );
    await writeFile(
      path.join(root, 'large.txt'),
      Buffer.alloc(1024 * 1024 + 1, 65)
    );
    const service = new LocalReadService();
    await expect(service.listDirectory(root)).resolves.toMatchObject({
      entries: expect.arrayContaining([
        expect.objectContaining({ name: 'docs', kind: 'DIRECTORY' })
      ])
    });
    await expect(
      service.readFile(root, 'docs/readme.md')
    ).resolves.toMatchObject({ content: 'hello', encoding: 'utf-8' });
    await expect(service.readFile(root, '../outside')).rejects.toSatisfy(
      (error) => failureCode(error) === 'LOCAL_PATH_OUTSIDE_WORKSPACE'
    );
    await expect(
      service.readFile(root, path.resolve(root, 'docs/readme.md'))
    ).rejects.toSatisfy(
      (error) => failureCode(error) === 'LOCAL_PATH_OUTSIDE_WORKSPACE'
    );
    await expect(service.readFile(root, '')).rejects.toSatisfy(
      (error) => failureCode(error) === 'LOCAL_NOT_FILE'
    );
    await expect(service.readFile(root, 'missing.txt')).rejects.toSatisfy(
      (error) => failureCode(error) === 'LOCAL_PATH_NOT_FOUND'
    );
    await expect(service.readFile(root, 'docs')).rejects.toSatisfy(
      (error) => failureCode(error) === 'LOCAL_NOT_FILE'
    );
    await expect(service.listDirectory(root, 'binary.bin')).rejects.toSatisfy(
      (error) => failureCode(error) === 'LOCAL_NOT_DIRECTORY'
    );
    await expect(service.readFile(root, 'binary.bin')).rejects.toSatisfy(
      (error) => failureCode(error) === 'LOCAL_BINARY_UNSUPPORTED'
    );
    await expect(service.readFile(root, 'invalid-utf8.txt')).rejects.toSatisfy(
      (error) => failureCode(error) === 'LOCAL_BINARY_UNSUPPORTED'
    );
    await expect(service.readFile(root, 'large.txt')).rejects.toSatisfy(
      (error) => failureCode(error) === 'LOCAL_FILE_TOO_LARGE'
    );
  });
  it('does not follow outside-root symlinks', async () => {
    const root = await createTemp();
    const outside = await createTemp();
    await writeFile(path.join(outside, 'secret.txt'), 'secret');
    await symlink(outside, path.join(root, 'outside-link'), 'dir');
    const service = new LocalReadService();
    await expect(service.listDirectory(root)).resolves.toMatchObject({
      entries: [
        expect.objectContaining({ name: 'outside-link', kind: 'SYMLINK' })
      ]
    });
    await expect(
      service.readFile(root, 'outside-link/secret.txt')
    ).rejects.toSatisfy(
      (error) => failureCode(error) === 'LOCAL_PATH_OUTSIDE_WORKSPACE'
    );
  });
  it('rejects prefix-confusion symlink targets and never silently truncates short reads', async () => {
    const root = await createTemp();
    const sibling = `${root}-sibling`;
    await mkdir(sibling);
    directories.push(sibling);
    await writeFile(path.join(sibling, 'secret.txt'), 'secret');
    await symlink(sibling, path.join(root, 'prefix-link'), 'dir');
    const service = new LocalReadService();
    await expect(
      service.readFile(root, 'prefix-link/secret.txt')
    ).rejects.toSatisfy(
      (error) => failureCode(error) === 'LOCAL_PATH_OUTSIDE_WORKSPACE'
    );
    await writeFile(path.join(root, 'short.txt'), 'placeholder');
    const chunks = [Buffer.from('short '), Buffer.from('read')];
    const shortReadService = new LocalReadService({
      openFile: async () =>
        ({
          read: async (buffer: Buffer, offset: number) => {
            const chunk = chunks.shift() ?? Buffer.alloc(0);
            chunk.copy(buffer, offset);
            return { bytesRead: chunk.length, buffer };
          },
          close: async () => undefined
        }) as never
    });
    await expect(
      shortReadService.readFile(root, 'short.txt')
    ).resolves.toMatchObject({
      content: 'short read',
      size: 10
    });
  });
  it('enforces authorization and unbind behavior without stale fallback', async () => {
    const directory = await createTemp();
    const deviceId = asDeviceId('device');
    const store = new WorkspaceStore(directory);
    const gateway = {
      getCurrentUser: async () => ({
        ok: true as const,
        data: { id: 'user', name: 'User', systemRole: 'EMPLOYEE' as const }
      }),
      getProject: async () => ({ ok: true as const, data: {} })
    } as never;
    const service = new WorkspaceService({
      gateway,
      dialog: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      },
      store,
      deviceId
    });
    await expect(service.listDirectory('project')).rejects.toSatisfy(
      (error) => failureCode(error) === 'WORKSPACE_NOT_BOUND'
    );
    const binding = createWorkspaceBinding(
      {
        id: asWorkspaceBindingId('binding'),
        userId: asUserId('user'),
        projectId: asProjectId('project'),
        deviceId,
        localPath: directory,
        permissions: ['LOCAL_READ']
      },
      new Date()
    );
    await store.upsert(binding);
    await service.unbind('project');
    await expect(service.listDirectory('project')).rejects.toSatisfy(
      (error) => failureCode(error) === 'WORKSPACE_NOT_BOUND'
    );
  });
  it('makes get observe a started unbind mutation', async () => {
    const directory = await createTemp();
    const deviceId = asDeviceId('device');
    const store = new WorkspaceStore(directory);
    await store.upsert(
      createWorkspaceBinding(
        {
          id: asWorkspaceBindingId('binding'),
          userId: asUserId('user'),
          projectId: asProjectId('project'),
          deviceId,
          localPath: directory,
          permissions: ['LOCAL_READ']
        },
        new Date()
      )
    );
    const removal = store.remove('user', 'project', deviceId);
    await expect(
      store.get('user', 'project', deviceId)
    ).resolves.toBeUndefined();
    await expect(removal).resolves.toBe(true);
  });
  it('fails closed when current identity is unavailable and rejects bindings without LOCAL_READ', async () => {
    const directory = await createTemp();
    const deviceId = asDeviceId('device');
    const offline = new WorkspaceService({
      gateway: {
        getCurrentUser: async () => ({
          ok: false as const,
          error: { code: 'API_UNAVAILABLE', message: 'Offline', details: {} }
        })
      } as never,
      dialog: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      },
      store: new WorkspaceStore(directory),
      deviceId
    });
    await expect(offline.get('project')).rejects.toSatisfy(
      (error) => failureCode(error) === 'API_UNAVAILABLE'
    );
    const insecureBinding = {
      id: asWorkspaceBindingId('binding'),
      userId: asUserId('user'),
      projectId: asProjectId('project'),
      deviceId,
      localPath: directory,
      permissions: [] as const,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const store = {
      get: async () => insecureBinding
    } as unknown as WorkspaceStore;
    const service = new WorkspaceService({
      gateway: {
        getCurrentUser: async () => ({
          ok: true as const,
          data: { id: 'user', name: 'User', systemRole: 'EMPLOYEE' as const }
        }),
        getProject: async () => ({ ok: true as const, data: {} })
      } as never,
      dialog: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      },
      store,
      deviceId
    });
    await expect(service.listDirectory('project')).rejects.toSatisfy(
      (error) => failureCode(error) === 'LOCAL_PERMISSION_DENIED'
    );
  });
});
