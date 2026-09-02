/* eslint-disable @typescript-eslint/no-explicit-any -- SDK test double intentionally covers only responses.create. */
import { describe, expect, it } from 'vitest';
import { ModelProviderError } from '../../apps/api/src/providers/model-provider.js';
import { OpenAIResponsesProvider } from '../../apps/api/src/providers/openai-responses-provider.js';
import { readOnlyToolDefinitions } from '../../apps/api/src/modules/model-runtime/read-only-tool-registry.js';

function provider(create: (...args: any[]) => Promise<any>) { return new OpenAIResponsesProvider({ OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'gpt-test' }, { responses: { create } } as any); }

describe('OpenAIResponsesProvider', () => {
  it('uses its environment model with store disabled and maps the safe response fields', async () => {
    const calls:any[] = []; const value = await provider(async input => { calls.push(input); return { id: 'response-1', output_text: 'safe output', usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 } }; }).generate({ instructions: 'server only', input: 'prompt' });
    expect(calls).toEqual([expect.objectContaining({ model: 'gpt-test', instructions: 'server only', input: 'prompt', store: false })]); expect(calls[0]).not.toHaveProperty('stream'); expect(calls[0]).not.toHaveProperty('tools'); expect(calls[0]).not.toHaveProperty('previous_response_id'); expect(value).toEqual({ kind: 'final', outputText: 'safe output', providerResponseId: 'response-1', inputTokens: 3, outputTokens: 4, totalTokens: 7, replayItems: [] });
  });
  it.each([{ status: 429 }, { name: 'APIConnectionTimeoutError' }, new Error('provider raw secret')])('maps provider failures without exposing raw errors', async failure => {
    await expect(provider(async () => { throw failure; }).generate({ instructions: 'ignored', input: 'ignored' })).rejects.toBeInstanceOf(ModelProviderError);
    await expect(provider(async () => { throw failure; }).generate({ instructions: 'ignored', input: 'ignored' })).rejects.not.toThrow('secret');
  });
  it('maps Responses function calls and sends strict read-only tool definitions', async () => {
    const calls:any[]=[]; const result=await provider(async input=>{calls.push(input);return{id:'response-tool',output:[{type:'function_call',call_id:'call-1',name:'get_task_snapshot',arguments:'{}'}]};}).generate({instructions:'server',input:'prompt',tools:readOnlyToolDefinitions});
    expect(calls[0].tools).toEqual(readOnlyToolDefinitions); expect(result).toEqual(expect.objectContaining({kind:'tool_calls',calls:[{callId:'call-1',name:'get_task_snapshot',argumentsJson:'{}'}]}));
  });
  it('replays function calls and outputs in order with store disabled', async () => {
    const calls:any[]=[]; await provider(async input=>{calls.push(input);return{id:'response-final',output_text:'done',output:[]};}).generate({instructions:'server',input:'prompt',tools:readOnlyToolDefinitions,replayItems:[{type:'reasoning',id:'r'},{type:'function_call',call_id:'call-1',name:'get_task_snapshot',arguments:'{}'},{type:'function_call_output',call_id:'call-1',output:'{}'}]});
    expect(calls[0].input).toEqual([{role:'user',content:'prompt'},{type:'reasoning',id:'r'},{type:'function_call',call_id:'call-1',name:'get_task_snapshot',arguments:'{}'},{type:'function_call_output',call_id:'call-1',output:'{}'}]); expect(calls[0].store).toBe(false);
  });
});
