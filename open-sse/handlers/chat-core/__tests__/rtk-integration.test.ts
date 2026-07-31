import { describe, expect, it, vi } from "vitest";
import { chatCorePhaseTranslateAndBundle } from "../chat-core-phase-translate-and-bundle.ts";

const mocks = vi.hoisted(() => ({
  isProxyContextCompressionEnabled: vi.fn<() => Promise<boolean>>(),
  translateInboundRequestBody: vi.fn(),
  createExecuteProviderRequestBundle: vi.fn(),
  infoLog: vi.fn(),
}));

const provider = "openai";
const model = "test-model";

function makePipeline() {
  return {
    body: { messages: [{ role: "tool", content: makeDiff() }] },
    modelInfo: { provider, model },
    requestedModel: model,
    startTime: 1,
    provider,
    model,
    effectiveModel: model,
    resolvedModel: model,
    sourceFormat: "openai",
    targetFormat: "openai",
    stream: false,
    extendedContext: false,
    log: { info: mocks.infoLog },
    persistFailureUsage: vi.fn(),
  };
}

vi.mock("@/lib/cacheControlSettings", () => ({
  getCacheControlSettings: vi.fn(async () => "auto"),
}));

vi.mock("../../../services/contextValidationSettings.ts", () => ({
  isProxyContextCompressionEnabled: mocks.isProxyContextCompressionEnabled,
  // A partial mock of a module the code under test reads from is a mock that breaks the moment
  // that code reads one more setting — which is exactly what happened here.
  getCavemanOutputLevel: vi.fn(async () => "off"),
  getCompressionPreset: vi.fn(async () => ({ preset: "balanced", engines: null })),
}));

vi.mock("../../../compression/engines/dedup-store-wiring.ts", () => ({
  useDurableDedupStore: vi.fn(async () => {}),
}));

vi.mock("../../../utils/requestLogger.ts", () => ({
  createRequestLogger: vi.fn(async () => ({
    logClientRawRequest: vi.fn(),
  })),
}));

vi.mock("../../phases/input-sanitizer.ts", () => ({
  sanitizeRequestInput: vi.fn(async (body) => body),
}));

vi.mock("../../phases/semantic-cache-handler.ts", () => ({
  checkSemanticCache: vi.fn(() => null),
}));

vi.mock("../chat-core-translate-inbound-body.ts", () => ({
  translateInboundRequestBody: mocks.translateInboundRequestBody,
}));

vi.mock("../chat-core-create-execute-provider-request.ts", () => ({
  createExecuteProviderRequestBundle: mocks.createExecuteProviderRequestBundle,
}));

vi.mock("../chat-core-post-translate-tune.ts", () => ({
  extractToolNameMapAndTuneTranslatedBody: vi.fn(() => null),
}));

function makeDiff(): string {
  const lines = [
    "diff --git a/src/file.js b/src/file.js",
    "index abc..def 100644",
    "--- a/src/file.js",
    "+++ b/src/file.js",
    "@@ -1,120 +1,120 @@",
  ];
  for (let i = 0; i < 120; i++) {
    lines.push(`-const oldValue${i} = "removed value ${i} with padding padding padding";`);
    lines.push(`+const newValue${i} = "added value ${i} with padding padding padding padding";`);
  }
  return lines.join("\n");
}

async function runPhaseWithRtk(enabled: boolean) {
  vi.clearAllMocks();

  const diff = makeDiff();
  const pipeline = makePipeline();
  let bundledBody: Record<string, unknown> | null = null;
  let bodyAtTranslateTime = "";

  mocks.isProxyContextCompressionEnabled.mockResolvedValue(enabled);
  // Compression runs on the INBOUND body, before translation, so the translator is where its
  // effect first becomes observable. Capturing the content here is what proves the ordering
  // rather than merely assuming it.
  mocks.translateInboundRequestBody.mockImplementation(async (args) => {
    const body = args.body as { messages: Array<{ content: string }> };
    bodyAtTranslateTime = body.messages[0].content;
    return { ok: true, translatedBody: body };
  });
  mocks.createExecuteProviderRequestBundle.mockImplementation(async (args) => {
    bundledBody = args.translatedBody;
    return {};
  });
  const outcome = await chatCorePhaseTranslateAndBundle(pipeline as never);

  return { outcome, diff, pipeline, bundledBody, bodyAtTranslateTime };
}

describe("chatCorePhaseTranslateAndBundle RTK integration", () => {
  // These previously asserted that the TRANSLATED body was compressed. Compression moved to the
  // inbound body, before translation, precisely so every target format benefits from it — the
  // translated shapes (`input`, `contents`, `conversationState`) are ones the compression code
  // does not understand, so compressing after translation silently no-oped for most providers.
  // The assertions now follow the code: the body is already compressed when translation is
  // handed it.
  it("compresses tool results before translation runs, when enabled", async () => {
    const { outcome, diff, bundledBody, bodyAtTranslateTime } = await runPhaseWithRtk(true);

    expect(outcome).toEqual({ done: false });
    expect(bodyAtTranslateTime.length).toBeLessThan(diff.length);
    expect(bodyAtTranslateTime).toContain(
      "[diff truncated — re-read individual files for full hunks]"
    );
    expect(bundledBody).not.toBeNull();
    expect(mocks.infoLog).toHaveBeenCalledWith("RTK", expect.stringContaining("[RTK] saved"));
    expect(mocks.infoLog).toHaveBeenCalledWith("RTK", expect.stringContaining("git-diff"));
  });

  it("leaves tool results untouched when compression is disabled", async () => {
    const { diff, bundledBody, bodyAtTranslateTime } = await runPhaseWithRtk(false);

    expect(bodyAtTranslateTime).toBe(diff);
    expect(bundledBody).not.toBeNull();
    expect(mocks.infoLog).not.toHaveBeenCalled();
  });
});
