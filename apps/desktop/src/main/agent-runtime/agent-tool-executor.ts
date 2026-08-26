import { createHash } from 'node:crypto';
import type {
  AgentToolCompletionReceipt,
  AgentToolRequest
} from '@enterprise-brain/contracts';
import type { WorkspaceService } from '../workspace/workspace-service.js';
import type { DesktopApiGateway } from '../desktop-api-gateway.js';
import { LocalCapabilityFailure } from '../workspace/workspace-types.js';
export class AgentToolExecutor {
  constructor(private readonly workspace: WorkspaceService, private readonly gateway: DesktopApiGateway) {}
  async execute(
    request: AgentToolRequest
  ): Promise<{ receipt: AgentToolCompletionReceipt; localResult?: unknown }> {
    try {
      const current = await this.gateway.getCurrentUser();
      if (!current.ok || current.data.id !== request.userId) return { receipt: failed(request.id, 'AGENT_TOOL_REQUEST_INVALID', 'ToolRequest user does not match current identity') };
      switch (request.name) {
      case 'list_directory': {
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
      case 'read_file': {
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
      }
      default:
        return { receipt: failed((request as { id: string }).id, 'AGENT_TOOL_REQUEST_INVALID', 'Unsupported Agent tool request') };
      }
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
function failed(toolCallId: string, code: string, message: string): AgentToolCompletionReceipt { return { toolCallId, status: 'FAILED', error: { code, message, details: {} } }; }
