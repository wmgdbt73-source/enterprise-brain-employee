import path from 'node:path';
import type { WorkspaceBinding } from '@enterprise-brain/domain';
import { readJsonFile, writeJsonAtomically } from './json-file.js';

interface StoredBindings {
  version: 1;
  bindings: WorkspaceBinding[];
}

export class WorkspaceStore {
  private readonly filePath: string;
  private pending = Promise.resolve();
  constructor(directory: string) {
    this.filePath = path.join(directory, 'workspace-bindings.json');
  }
  async get(
    userId: string,
    projectId: string,
    deviceId: string
  ): Promise<WorkspaceBinding | undefined> {
    return (await this.read()).bindings.find(
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
      return { version: 1, bindings: [...retained, binding] };
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
  private async read(): Promise<StoredBindings> {
    const state = await readJsonFile<StoredBindings>(this.filePath);
    if (!state) return { version: 1, bindings: [] };
    if (state.version !== 1 || !Array.isArray(state.bindings))
      throw new Error('Workspace metadata is invalid');
    return { version: 1, bindings: state.bindings.map(hydrateBinding) };
  }
  private mutate(
    mutator: (state: StoredBindings) => Promise<StoredBindings>
  ): Promise<void> {
    const operation = this.pending.then(async () =>
      writeJsonAtomically(this.filePath, await mutator(await this.read()))
    );
    this.pending = operation.catch(() => undefined);
    return operation;
  }
}

function hydrateBinding(binding: WorkspaceBinding): WorkspaceBinding {
  const createdAt = new Date(binding.createdAt);
  const updatedAt = new Date(binding.updatedAt);
  if (Number.isNaN(createdAt.valueOf()) || Number.isNaN(updatedAt.valueOf())) {
    throw new Error('Workspace metadata is invalid');
  }
  return { ...binding, createdAt, updatedAt };
}
