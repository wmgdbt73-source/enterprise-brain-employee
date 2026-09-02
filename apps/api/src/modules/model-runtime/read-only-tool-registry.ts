import type { ReadOnlyToolDefinition, ReadOnlyToolName } from '../../providers/model-provider.js';

export const readOnlyToolDefinitions: readonly ReadOnlyToolDefinition[] = [
  { type: 'function', name: 'get_task_snapshot', description: 'Get the current Task and its dependencies.', strict: true, parameters: { type: 'object', additionalProperties: false, properties: {} } },
  { type: 'function', name: 'list_task_artifacts', description: 'List up to twenty registered Artifacts for the current Task.', strict: true, parameters: { type: 'object', additionalProperties: false, properties: {} } }
];
export function isReadOnlyToolName(value: string): value is ReadOnlyToolName { return value === 'get_task_snapshot' || value === 'list_task_artifacts'; }
export function validEmptyArguments(value: string): boolean { try { const parsed: unknown = JSON.parse(value); return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && Object.keys(parsed).length === 0; } catch { return false; } }
