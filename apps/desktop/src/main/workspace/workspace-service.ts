import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import {
  asProjectId,
  asUserId,
  asWorkspaceBindingId,
  createWorkspaceBinding,
  type DeviceId,
  type WorkspaceBinding
} from '@enterprise-brain/domain';
import type { DesktopApiGateway } from '../desktop-api-gateway.js';
import { LocalReadService } from './local-read-service.js';
import {
  LocalCapabilityFailure,
  localFailure,
  type DirectoryListing,
  type TextFile,
  type WorkspaceBindingView
} from './workspace-types.js';
import { WorkspaceStore } from './workspace-store.js';

export interface DirectoryDialog {
  showOpenDialog(): Promise<{ canceled: boolean; filePaths: string[] }>;
}

export class WorkspaceService {
  constructor(
    private readonly options: {
      gateway: DesktopApiGateway;
      dialog: DirectoryDialog;
      store: WorkspaceStore;
      deviceId: DeviceId;
      localRead?: LocalReadService;
    }
  ) {}

  async get(projectId: string): Promise<WorkspaceBindingView | null> {
    const userId = await this.authorizeProject(projectId);
    return this.toView(
      await this.options.store.get(userId, projectId, this.options.deviceId)
    );
  }
  async select(
    projectId: string
  ): Promise<{ cancelled: boolean; binding?: WorkspaceBindingView }> {
    const userId = await this.authorizeProject(projectId);
    const selection = await this.options.dialog.showOpenDialog();
    if (selection.canceled || !selection.filePaths[0])
      return { cancelled: true };
    let localPath: string;
    try {
      localPath = await realpath(selection.filePaths[0]);
    } catch {
      localFailure(
        'LOCAL_PATH_NOT_FOUND',
        'Selected workspace folder was not found'
      );
    }
    const now = new Date();
    const existing = await this.options.store.get(
      userId,
      projectId,
      this.options.deviceId
    );
    const binding = createWorkspaceBinding(
      {
        id: existing?.id ?? asWorkspaceBindingId(randomUUID()),
        userId: asUserId(userId),
        projectId: asProjectId(projectId),
        deviceId: this.options.deviceId,
        localPath,
        permissions: ['LOCAL_READ']
      },
      now
    );
    await this.options.store.upsert(binding);
    return { cancelled: false, binding: this.toView(binding)! };
  }
  async unbind(projectId: string): Promise<void> {
    const user = await this.options.gateway.getCurrentUser();
    if (!user.ok) throw new LocalCapabilityFailure(user.error);
    await this.options.store.remove(
      user.data.id,
      projectId,
      this.options.deviceId
    );
  }
  async listDirectory(
    projectId: string,
    relativePath = ''
  ): Promise<DirectoryListing> {
    const binding = await this.authorizedBinding(projectId);
    return (this.options.localRead ?? new LocalReadService()).listDirectory(
      binding.localPath,
      relativePath
    );
  }
  async readFile(projectId: string, relativePath: string): Promise<TextFile> {
    const binding = await this.authorizedBinding(projectId);
    return (this.options.localRead ?? new LocalReadService()).readFile(
      binding.localPath,
      relativePath
    );
  }
  /** Main-process-only write context; no renderer bridge exposes this local path or device identifier. */
  async getConfirmedWriteContext(projectId: string): Promise<{ localPath: string; deviceId: string }> {
    const binding = await this.authorizedBinding(projectId);
    return { localPath: binding.localPath, deviceId: this.options.deviceId };
  }
  private async authorizedBinding(
    projectId: string
  ): Promise<WorkspaceBinding> {
    const userId = await this.authorizeProject(projectId);
    const binding = await this.options.store.get(
      userId,
      projectId,
      this.options.deviceId
    );
    if (!binding)
      localFailure(
        'WORKSPACE_NOT_BOUND',
        'No local workspace is bound to this project'
      );
    if (!binding.permissions.includes('LOCAL_READ'))
      localFailure(
        'LOCAL_PERMISSION_DENIED',
        'Local read permission is required'
      );
    return binding;
  }
  private async authorizeProject(projectId: string): Promise<string> {
    const user = await this.options.gateway.getCurrentUser();
    if (!user.ok) throw new LocalCapabilityFailure(user.error);
    const project = await this.options.gateway.getProject(projectId);
    if (!project.ok) throw new LocalCapabilityFailure(project.error);
    return user.data.id;
  }
  private toView(
    binding: WorkspaceBinding | undefined
  ): WorkspaceBindingView | null {
    return binding
      ? {
          id: binding.id,
          userId: binding.userId,
          projectId: binding.projectId,
          localPath: binding.localPath,
          permissions: [...binding.permissions],
          createdAt: binding.createdAt.toISOString(),
          updatedAt: binding.updatedAt.toISOString()
        }
      : null;
  }
}
