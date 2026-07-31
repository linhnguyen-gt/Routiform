import type { ChatCoreHandlerResult, HandleChatCoreArgs } from "./chat-core-pipeline.ts";
import { initChatCorePipeline } from "./chat-core-pipeline.ts";
import { chatCorePhaseFirstUpstream } from "./chat-core-phase-first-upstream.ts";
import { chatCorePhaseNonStreamComplete } from "./chat-core-phase-non-stream-complete.ts";
import { chatCorePhaseNonStreamParse } from "./chat-core-phase-non-stream-parse.ts";
import { chatCorePhaseSetupAndLogs } from "./chat-core-phase-setup-and-logs.ts";
import { chatCorePhaseStreamingResponse } from "./chat-core-phase-streaming.ts";
import { chatCorePhaseTranslateAndBundle } from "./chat-core-phase-translate-and-bundle.ts";
import { chatCorePhaseUpstreamErrors } from "./chat-core-phase-upstream-errors.ts";
import { chatCorePhaseUpstreamOauthRetry } from "./chat-core-phase-upstream-oauth-retry.ts";
import { attachCompressionHeader } from "./chat-core-compression-header.ts";

export async function runChatCoreOrchestrator(
  args: HandleChatCoreArgs
): Promise<ChatCoreHandlerResult> {
  const p = initChatCorePipeline(args);

  const emit = <T extends { response?: unknown }>(result: T): T =>
    attachCompressionHeader(result, p.compressionHeader);

  const s1 = await chatCorePhaseSetupAndLogs(p);
  if (s1.done) return emit(s1.result as ChatCoreHandlerResult);

  const s2 = await chatCorePhaseTranslateAndBundle(p);
  if (s2.done) return emit(s2.result as ChatCoreHandlerResult);

  const s3 = await chatCorePhaseFirstUpstream(p);
  if (s3.done) return emit(s3.result as ChatCoreHandlerResult);

  await chatCorePhaseUpstreamOauthRetry(p);

  const s4 = await chatCorePhaseUpstreamErrors(p);
  if (s4.done) return emit(s4.result as ChatCoreHandlerResult);

  if (!p.stream) {
    const s5 = await chatCorePhaseNonStreamParse(p);
    if (s5.done) return emit(s5.result as ChatCoreHandlerResult);
    const s6 = await chatCorePhaseNonStreamComplete(p);
    return emit(s6.result as ChatCoreHandlerResult);
  }

  return emit((await chatCorePhaseStreamingResponse(p)) as ChatCoreHandlerResult);
}
