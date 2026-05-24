import test from "node:test";
import assert from "node:assert/strict";

const { handleImageGeneration } = await import("../../open-sse/handlers/imageGeneration.ts");
const { IMAGE_PROVIDERS } = await import("../../open-sse/config/imageRegistry.ts");

function makeProvider(id, overrides = {}) {
  return {
    id,
    baseUrl: `https://example.com/${id}/images`,
    authType: "apikey",
    authHeader: "bearer",
    format: "openai",
    models: [{ id: "test-model", name: "Test Model" }],
    supportedSizes: ["1024x1024"],
    ...overrides,
  };
}

test("image generation passes native n through when provider advertises native batching", async () => {
  const providerId = "fanout-native";
  const originalProvider = IMAGE_PROVIDERS[providerId];
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  let capturedN = null;

  IMAGE_PROVIDERS[providerId] = makeProvider(providerId, {
    supportsNativeN: true,
    maxNativeN: 10,
  });

  globalThis.fetch = async (_url, options = {}) => {
    fetchCalls += 1;
    const body = JSON.parse(String(options.body || "{}"));
    capturedN = body.n;
    return new Response(
      JSON.stringify({
        created: 123,
        data: [
          { url: "https://cdn.example.com/1.png" },
          { url: "https://cdn.example.com/2.png" },
          { url: "https://cdn.example.com/3.png" },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  try {
    const result = await handleImageGeneration({
      body: {
        model: `${providerId}/test-model`,
        prompt: "test native",
        n: 3,
      },
      credentials: { apiKey: "test-key" },
      log: null,
    });

    assert.equal(result.success, true);
    assert.equal(fetchCalls, 1);
    assert.equal(capturedN, 3);
    assert.equal(result.data.data.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalProvider) {
      IMAGE_PROVIDERS[providerId] = originalProvider;
    } else {
      delete IMAGE_PROVIDERS[providerId];
    }
  }
});

test("image generation fans out n>1 when provider supports parallel fanout", async () => {
  const providerId = "fanout-parallel";
  const originalProvider = IMAGE_PROVIDERS[providerId];
  const originalFetch = globalThis.fetch;
  const requestedNs = [];

  IMAGE_PROVIDERS[providerId] = makeProvider(providerId, {
    supportsParallelFanout: true,
    fanoutDefaultConcurrency: 2,
  });

  let callIndex = 0;
  globalThis.fetch = async (_url, options = {}) => {
    callIndex += 1;
    const body = JSON.parse(String(options.body || "{}"));
    requestedNs.push(body.n);
    return new Response(
      JSON.stringify({
        created: 1000 + callIndex,
        data: [{ url: `https://cdn.example.com/fanout-${callIndex}.png` }],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  try {
    const result = await handleImageGeneration({
      body: {
        model: `${providerId}/test-model`,
        prompt: "fanout me",
        n: 3,
      },
      credentials: { apiKey: "test-key" },
      log: null,
    });

    assert.equal(result.success, true);
    assert.deepEqual(requestedNs, [1, 1, 1]);
    assert.equal(result.data.data.length, 3);
    assert.deepEqual(
      result.data.data.map((entry) => entry.url),
      [
        "https://cdn.example.com/fanout-1.png",
        "https://cdn.example.com/fanout-2.png",
        "https://cdn.example.com/fanout-3.png",
      ]
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalProvider) {
      IMAGE_PROVIDERS[providerId] = originalProvider;
    } else {
      delete IMAGE_PROVIDERS[providerId];
    }
  }
});

test("image generation returns a clear error when fanout child requests partially fail", async () => {
  const providerId = "fanout-partial-failure";
  const originalProvider = IMAGE_PROVIDERS[providerId];
  const originalFetch = globalThis.fetch;
  let callIndex = 0;

  IMAGE_PROVIDERS[providerId] = makeProvider(providerId, {
    supportsParallelFanout: true,
    fanoutDefaultConcurrency: 2,
  });

  globalThis.fetch = async () => {
    callIndex += 1;
    if (callIndex === 2) {
      return new Response(JSON.stringify({ error: "rate limited" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        created: 2000 + callIndex,
        data: [{ url: `https://cdn.example.com/ok-${callIndex}.png` }],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  try {
    const result = await handleImageGeneration({
      body: {
        model: `${providerId}/test-model`,
        prompt: "fanout partial fail",
        n: 3,
      },
      credentials: { apiKey: "test-key" },
      log: null,
    });

    assert.equal(result.success, false);
    assert.equal(result.status, 502);
    assert.match(result.error, /2\/3 successful request\(s\)/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalProvider) {
      IMAGE_PROVIDERS[providerId] = originalProvider;
    } else {
      delete IMAGE_PROVIDERS[providerId];
    }
  }
});

test("image generation rejects n>1 when provider supports neither native batching nor fanout", async () => {
  const providerId = "fanout-unsupported";
  const originalProvider = IMAGE_PROVIDERS[providerId];

  IMAGE_PROVIDERS[providerId] = makeProvider(providerId, {
    supportsNativeN: false,
    supportsParallelFanout: false,
  });

  try {
    const result = await handleImageGeneration({
      body: {
        model: `${providerId}/test-model`,
        prompt: "unsupported",
        n: 2,
      },
      credentials: { apiKey: "test-key" },
      log: null,
    });

    assert.equal(result.success, false);
    assert.equal(result.status, 400);
    assert.match(result.error, /does not support n > 1 image generation/);
  } finally {
    if (originalProvider) {
      IMAGE_PROVIDERS[providerId] = originalProvider;
    } else {
      delete IMAGE_PROVIDERS[providerId];
    }
  }
});
