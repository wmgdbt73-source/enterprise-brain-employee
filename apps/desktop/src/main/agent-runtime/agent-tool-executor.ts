import { createHash } from 'node:crypto';
import type {
  AgentToolCompletionReceipt,
  AgentToolRequest
} from '@enterprise-brain/contracts';
import type { WorkspaceService } from '../workspace/workspace-service.js';
import { LocalCapabilityFailure } from '../workspace/workspace-types.js';
export class AgentToolExecutor {
  constructor(private readonly workspace: WorkspaceService) {}
  async execute(
    request: AgentToolRequest
  ): Promise<{ receipt: AgentToolCompletionReceipt; localResult?: unknown }> {
    try {
      if (request.name === 'list_directory') {
        const result = await this.workspace.listDirectory(
          request.projectId,
          request.relativePath
        );
        return {
          localResult: result,
          receipt: {
            toolCallId: request.id,
            status: 'SUCCEEDED',
            metadata: {
              relativePath: result.path,
              entryCount: result.entries.length
            }
          }
        };
      }
      const result = await this.workspace.readFile(
        request.projectId,
        request.relativePath
      );
      return {
        localResult: result,
        receipt: {
          toolCallId: request.id,
          status: 'SUCCEEDED',
          metadata: {
            relativePath: result.relativePath,
            size: result.size,
            encoding: result.encoding,
            sha256: createHash('sha256')
              .update(result.content, 'utf8')
              .digest('hex')
          }
        }
      };
    } catch (error) {
      const local =
        error instanceof LocalCapabilityFailure
          ? error.error
          : {
              code: 'LOCAL_IO_ERROR',
              message: 'Local tool execution failed',
              details: {}
            };
      return {
        receipt: {
          toolCallId: request.id,
          status: 'FAILED',
          error: { code: local.code, message: local.message, details: {} }
        }
      };
    }
  }
}
