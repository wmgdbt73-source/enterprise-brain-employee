import path from 'node:path';
import {
  rehydrateWorkspaceBinding,
  type WorkspaceBinding
} from '@enterprise-brain/domain';
import { readJsonFile, writeJsonAtomically } from './json-file.js';

interface StoredBindings {
  version: 1;
  bindings: SerializedWorkspaceBinding[];
}

interface SerializedWorkspaceBinding {
  id: string;
  userId: string;
  projectId: string;
  deviceId: string;
  localPath: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export class WorkspaceStore {
  private readonly filePath: string;
  private pending: Promise<void> = Promise.resolve();
  constructor(directory: string) {
    this.filePath = path.join(directory, 'workspace-bindings.json');
  }
  async get(
    userId: string,
    projectId: string,
    deviceId: string
  ): Promise<WorkspaceBinding | undefined> {
    await this.pending;
    return (await this.readRaw()).bindings
      .map((binding) => rehydrateWorkspaceBinding(binding as never))
      .find(
        (binding) =>
          binding.userId === userId &&
          binding.projectId === projectId &&
          binding.deviceId === deviceId
      );
  }
  upsert(binding: WorkspaceBinding): Promise<void> {
    return this.mutate(async (state) => {
      const retained = state.bindings.filter(
        (item) =>
          !(
            item.userId === binding.userId &&
            item.projectId === binding.projectId &&
            item.deviceId === binding.deviceId
          )
      );
      return { version: 1, bindings: [...retained, serializeBinding(binding)] };
    });
  }
  remove(
    userId: string,
    projectId: string,
    deviceId: string
  ): Promise<boolean> {
    let removed = false;
    return this.mutate(async (state) => {
      const bindings = state.bindings.filter((binding) => {
        const match =
          binding.userId === userId &&
          binding.projectId === projectId &&
          binding.deviceId === deviceId;
        removed ||= match;
        return !match;
      });
      return { version: 1, bindings };
    }).then(() => removed);
  }
  private async readRaw(): Promise<StoredBindings> {
    const state = await readJsonFile<StoredBindings>(this.filePath);
    if (!state) return { version: 1, bindings: [] };
    if (state.version !== 1 || !Array.isArray(state.bindings))
      throw new Error('Workspace metadata is invalid');
    return state;
  }
  private mutate(
    mutator: (state: StoredBindings) => Promise<StoredBindings>
  ): Promise<void> {
    const operation = this.pending.then(async () =>
      writeJsonAtomically(this.filePath, await mutator(await this.readRaw()))
    );
    this.pending = operation.catch(() => undefined);
    return operation;
  }
}

function serializeBinding(
  binding: WorkspaceBinding
): SerializedWorkspaceBinding {
  return {
    id: binding.id,
    userId: binding.userId,
    projectId: binding.projectId,
    deviceId: binding.deviceId,
    localPath: binding.localPath,
    permissions: [...binding.permissions],
    createdAt: binding.createdAt.toISOString(),
    updatedAt: binding.updatedAt.toISOString()
  };
}
