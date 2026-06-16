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
    body: { messages: [{ role: "user", content: "run" }] },
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
  const translatedBody = { messages: [{ role: "tool", content: diff }] };
  let bundledBody: Record<string, unknown> | null = null;

  mocks.isProxyContextCompressionEnabled.mockResolvedValue(enabled);
  mocks.translateInboundRequestBody.mockResolvedValue({ ok: true, translatedBody });
  mocks.createExecuteProviderRequestBundle.mockImplementation(async (args) => {
    bundledBody = args.translatedBody;
    return {};
  });
  const outcome = await chatCorePhaseTranslateAndBundle(makePipeline() as never);

  return { outcome, diff, translatedBody, bundledBody };
}

describe("chatCorePhaseTranslateAndBundle RTK integration", () => {
  it("compresses translated tool results before creating the execution bundle when enabled", async () => {
    const { outcome, diff, translatedBody, bundledBody } = await runPhaseWithRtk(true);
    const content = translatedBody.messages[0].content;

    expect(outcome).toEqual({ done: false });
    expect(content.length).toBeLessThan(diff.length);
    expect(content).toContain("[full diff: rtk git diff --no-compact]");
    expect(bundledBody).toBe(translatedBody);
    expect(mocks.infoLog).toHaveBeenCalledWith("RTK", expect.stringContaining("[RTK] saved"));
    expect(mocks.infoLog).toHaveBeenCalledWith("RTK", expect.stringContaining("git-diff"));
  });

  it("leaves translated tool results untouched when the reused toggle is disabled", async () => {
    const { diff, translatedBody, bundledBody } = await runPhaseWithRtk(false);

    expect(translatedBody.messages[0].content).toBe(diff);
    expect(bundledBody).toBe(translatedBody);
    expect(mocks.infoLog).not.toHaveBeenCalled();
  });
});
