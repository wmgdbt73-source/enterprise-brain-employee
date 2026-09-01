export type ModelGenerationRequest={instructions:string;input:string};
export type ModelGeneration={outputText:string;providerResponseId?:string;inputTokens?:number;outputTokens?:number;totalTokens?:number};
export type ModelProviderErrorCode='MODEL_PROVIDER_NOT_CONFIGURED'|'MODEL_PROVIDER_TIMEOUT'|'MODEL_PROVIDER_RATE_LIMITED'|'MODEL_PROVIDER_FAILED';
export class ModelProviderError extends Error { constructor(readonly code:ModelProviderErrorCode){super(code);} }
export interface ModelProvider { readonly providerName:string; readonly model:string; generate(request:ModelGenerationRequest):Promise<ModelGeneration>; }
