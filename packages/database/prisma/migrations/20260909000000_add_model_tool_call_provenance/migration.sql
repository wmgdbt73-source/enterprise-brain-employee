ALTER TABLE "agent_tool_calls" ADD COLUMN "provider_call_id" TEXT;
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_agent_run_id_provider_call_id_key" UNIQUE ("agent_run_id", "provider_call_id");
