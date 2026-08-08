/**
 * Cline's `globalState.json`.
 *
 * Cline keys the OpenAI-compatible model id per mode — `actModeOpenAiModelId` and
 * `planModeOpenAiModelId`. There is no shared `openAiModelId`, so writing that name only
 * left Act mode with no model while Plan mode looked configured.
 *
 * The base URL goes in without a `/v1` suffix: Cline hands it straight to the OpenAI SDK,
 * which appends the route itself.
 */

type JsonRecord = Record<string, unknown>;

/** Cline's provider id for a custom OpenAI-compatible endpoint (`openai-native` is real OpenAI). */
const CLINE_OPENAI_COMPATIBLE_PROVIDER = "openai";

/** Written by versions that used a key Cline never read. */
const DEAD_MODEL_KEY = "openAiModelId";

const stripV1Suffix = (baseUrl: string) =>
  baseUrl.endsWith("/v1") ? baseUrl.slice(0, -3) : baseUrl;

export function applyRoutiformClineState(
  existingState: unknown,
  { baseUrl, model }: { baseUrl: string; model: string }
): JsonRecord {
  const state: JsonRecord = { ...(existingState as JsonRecord) };

  state.actModeApiProvider = CLINE_OPENAI_COMPATIBLE_PROVIDER;
  state.planModeApiProvider = CLINE_OPENAI_COMPATIBLE_PROVIDER;
  state.openAiBaseUrl = stripV1Suffix(baseUrl);
  state.actModeOpenAiModelId = model;
  state.planModeOpenAiModelId = model;
  delete state[DEAD_MODEL_KEY];

  return state;
}

export function removeRoutiformClineState(existingState: unknown): JsonRecord {
  const state: JsonRecord = { ...(existingState as JsonRecord) };

  // Only unwind a state this app set up; a user who has since switched provider keeps it.
  if (state.actModeApiProvider !== CLINE_OPENAI_COMPATIBLE_PROVIDER) return state;

  delete state.openAiBaseUrl;
  delete state.actModeOpenAiModelId;
  delete state.planModeOpenAiModelId;
  delete state[DEAD_MODEL_KEY];
  state.actModeApiProvider = "cline";
  state.planModeApiProvider = "cline";

  return state;
}
