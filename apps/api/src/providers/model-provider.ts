export type ReadOnlyToolName = 'get_task_snapshot' | 'list_task_artifacts';
export type ReadOnlyToolDefinition = { type: 'function'; name: ReadOnlyToolName; description: string; strict: true; parameters: { type: 'object'; additionalProperties: false; properties: Record<string, never> } };
/** Opaque Responses items retained only while one HTTP request is being orchestrated. */
export type ProviderReplayItem = Record<string, unknown>;
export type ModelGenerationRequest={instructions:string;input:string;tools?:readonly ReadOnlyToolDefinition[];replayItems?:readonly ProviderReplayItem[]};
export type ModelGeneration={kind?:'final';outputText:string;providerResponseId?:string;inputTokens?:number;outputTokens?:number;totalTokens?:number;replayItems?:ProviderReplayItem[]}|{kind:'tool_calls';providerResponseId?:string;calls:Array<{callId:string;name:string;argumentsJson:string}>;inputTokens?:number;outputTokens?:number;totalTokens?:number;replayItems?:ProviderReplayItem[]};
export type ModelProviderErrorCode='MODEL_PROVIDER_NOT_CONFIGURED'|'MODEL_PROVIDER_TIMEOUT'|'MODEL_PROVIDER_RATE_LIMITED'|'MODEL_PROVIDER_FAILED';
export class ModelProviderError extends Error { constructor(readonly code:ModelProviderErrorCode){super(code);} }
export interface ModelProvider { readonly providerName:string; readonly model:string; generate(request:ModelGenerationRequest):Promise<ModelGeneration>; }
