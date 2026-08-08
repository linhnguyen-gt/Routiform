import test from "node:test";
import assert from "node:assert/strict";

const { validateProviderApiKey } = await import("../../src/lib/providers/validation.ts");
const { validateGeminiLikeProvider } =
  await import("../../src/lib/providers/validation/gemini-like.ts");
const { setSafeOutboundDnsLookupForTesting, resetSafeOutboundDnsLookupForTesting } =
  await import("../../src/lib/network/safeOutboundFetch.ts");

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  resetSafeOutboundDnsLookupForTesting();
});

test.beforeEach(() => {
  setSafeOutboundDnsLookupForTesting(async () => [{ address: "93.184.216.34", family: 4 }]);
});

test("validateProviderApiKey rejects missing provider or API key", async () => {
  const result = await validateProviderApiKey({ provider: "", apiKey: "" });

  assert.equal(result.valid, false);
  assert.equal(result.error, "Provider and API key required");
  assert.equal(result.unsupported, false);
});

test("validateProviderApiKey returns unsupported for unknown providers", async () => {
  const result = await validateProviderApiKey({
    provider: "definitely-unknown-provider",
    apiKey: "sk-test",
  });

  assert.equal(result.valid, false);
  assert.equal(result.error, "Provider validation not supported");
  assert.equal(result.unsupported, true);
});

test("openai-compatible validation reports missing base URL", async () => {
  const result = await validateProviderApiKey({
    provider: "openai-compatible-missing-base",
    apiKey: "sk-test",
    providerSpecificData: {},
  });

  assert.equal(result.valid, false);
  assert.match(result.error, /No base URL configured/i);
});

test("openai-compatible validation blocks localhost base URLs via outbound policy", async () => {
  const result = await validateProviderApiKey({
    provider: "openai-compatible-local-blocked",
    apiKey: "sk-test",
    providerSpecificData: { baseUrl: "http://localhost:11434/v1" },
  });

  assert.equal(result.valid, false);
  assert.match(result.error, /Blocked outbound request/i);
});

test("openai-compatible validation accepts rate-limited /models responses", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: init.headers || {} });
    return new Response(JSON.stringify({ error: "rate limited" }), { status: 429 });
  };

  const result = await validateProviderApiKey({
    provider: "openai-compatible-rate-limit",
    apiKey: "sk-test",
    providerSpecificData: { baseUrl: "https://api.example.com/v1" },
  });

  assert.equal(result.valid, true);
  assert.equal(result.method, "models_endpoint");
  assert.match(result.warning, /Rate limited/i);
  assert.deepEqual(
    calls.map((call) => call.url),
    ["https://api.example.com/v1/models"]
  );
  assert.equal(calls[0].headers.Authorization, "Bearer sk-test");
});

test("openai-compatible validation forwards custom User-Agent", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: init.headers || {} });
    return new Response(JSON.stringify({ error: "rate limited" }), { status: 429 });
  };

  const result = await validateProviderApiKey({
    provider: "openai-compatible-custom-ua",
    apiKey: "sk-test",
    providerSpecificData: {
      baseUrl: "https://api.example.com/v1",
      customUserAgent: "MyRouteTester/1.0",
    },
  });

  assert.equal(result.valid, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example.com/v1/models");
  assert.equal(calls[0].headers["User-Agent"], "MyRouteTester/1.0");
});

test("openai-compatible validation treats chat 400 as authenticated fallback", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/models")) {
      return new Response(JSON.stringify({ error: "server error" }), { status: 500 });
    }

    return new Response(JSON.stringify({ error: "bad model" }), { status: 400 });
  };

  const result = await validateProviderApiKey({
    provider: "openai-compatible-fallback-chat",
    apiKey: "sk-test",
    providerSpecificData: {
      baseUrl: "https://api.example.com/v1",
      validationModelId: "custom-model",
    },
  });

  assert.equal(result.valid, true);
  assert.equal(result.method, "inference_available");
  assert.match(result.warning, /Model ID may be invalid/i);
  assert.deepEqual(calls, [
    "https://api.example.com/v1/models",
    "https://api.example.com/v1/chat/completions",
  ]);
});

test("openai-compatible validation returns actionable connection failure when probes fail", async () => {
  globalThis.fetch = async () => {
    throw new Error("socket hang up");
  };

  const result = await validateProviderApiKey({
    provider: "openai-compatible-network-error",
    apiKey: "sk-test",
    providerSpecificData: {
      baseUrl: "https://api.example.com/v1",
      validationModelId: "custom-model",
    },
  });

  assert.equal(result.valid, false);
  assert.equal(result.error, "Connection failed while testing /chat/completions");
});

test("anthropic-compatible validation requires a base URL", async () => {
  const result = await validateProviderApiKey({
    provider: "anthropic-compatible-no-base",
    apiKey: "sk-test",
    providerSpecificData: {},
  });

  assert.equal(result.valid, false);
  assert.match(result.error, /No base URL configured/i);
});

test("anthropic-compatible validation rejects invalid keys from /models", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  };

  const result = await validateProviderApiKey({
    provider: "anthropic-compatible-bad-key",
    apiKey: "sk-test",
    providerSpecificData: { baseUrl: "https://api.example.com/v1/messages" },
  });

  assert.equal(result.valid, false);
  assert.equal(result.error, "Invalid API key");
  assert.deepEqual(calls, ["https://api.example.com/v1/models"]);
});

test("anthropic-compatible validation falls back to /messages and treats 400 as auth success", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/models")) {
      throw new Error("models endpoint unavailable");
    }

    return new Response(JSON.stringify({ error: "bad request" }), { status: 400 });
  };

  const result = await validateProviderApiKey({
    provider: "anthropic-compatible-fallback",
    apiKey: "sk-test",
    providerSpecificData: {
      baseUrl: "https://api.example.com/v1/messages",
      validationModelId: "claude-custom",
    },
  });

  assert.equal(result.valid, true);
  assert.equal(result.error, null);
  assert.deepEqual(calls, [
    "https://api.example.com/v1/models",
    "https://api.example.com/v1/messages",
  ]);
});

test("registry openai-like providers report unsupported validation endpoints on 404 chat probes", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  };

  const result = await validateProviderApiKey({
    provider: "openai",
    apiKey: "sk-test",
  });

  assert.equal(result.valid, false);
  assert.equal(result.error, "Provider validation endpoint not supported");
  assert.deepEqual(calls, [
    "https://api.openai.com/v1/models",
    "https://api.openai.com/v1/chat/completions",
  ]);
});

// The `gemini` provider is gone (removed with migration 029), and `vertex` — the only
// remaining registry entry carrying `format: "gemini"` — is handled by a specialty
// validator for Service Account JSON, so it never reaches the gemini-like branch either.
// These tests therefore drive `validateGeminiLikeProvider` directly. The format is very
// much alive (antigravity runs on it), so its response-parsing branches still need pinning.
const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

test("gemini-like validation rejects invalid API keys (401)", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers });
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  };

  const result = await validateGeminiLikeProvider({
    apiKey: "bad-key",
    baseUrl: GEMINI_MODELS_URL,
  });

  assert.equal(result.valid, false);
  assert.equal(result.error, "Invalid API key");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.equal(calls[0].headers["x-goog-api-key"], "bad-key");
});

test("gemini-like validation rejects invalid API keys (400 with API_KEY_INVALID)", async () => {
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        error: {
          code: 400,
          message: "API key not valid. Please pass a valid API key.",
          status: "INVALID_ARGUMENT",
          details: [{ reason: "API_KEY_INVALID" }],
        },
      }),
      { status: 400 }
    );
  };

  const result = await validateGeminiLikeProvider({
    apiKey: "bad-key",
    baseUrl: GEMINI_MODELS_URL,
  });

  assert.equal(result.valid, false);
  assert.equal(result.error, "Invalid API key");
});

test("gemini-like validation rejects expired API keys (400 with API_KEY_EXPIRED)", async () => {
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        error: {
          code: 400,
          message: "API key expired.",
          status: "INVALID_ARGUMENT",
          details: [{ reason: "API_KEY_EXPIRED" }],
        },
      }),
      { status: 400 }
    );
  };

  const result = await validateGeminiLikeProvider({
    apiKey: "expired-key",
    baseUrl: GEMINI_MODELS_URL,
  });

  assert.equal(result.valid, false);
  assert.equal(result.error, "Invalid API key");
});

test("gemini-like validation rejects invalid keys via PERMISSION_DENIED status", async () => {
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        error: {
          code: 400,
          message: "Request had insufficient authentication scopes.",
          status: "PERMISSION_DENIED",
          details: [],
        },
      }),
      { status: 400 }
    );
  };

  const result = await validateGeminiLikeProvider({
    apiKey: "bad-key",
    baseUrl: GEMINI_MODELS_URL,
  });

  assert.equal(result.valid, false);
  assert.equal(result.error, "Invalid API key");
});

test("gemini-like validation accepts valid API key (200)", async () => {
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        models: [
          { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
        ],
      }),
      { status: 200 }
    );
  };

  const result = await validateGeminiLikeProvider({
    apiKey: "valid-key",
    baseUrl: GEMINI_MODELS_URL,
  });

  assert.equal(result.valid, true);
  assert.equal(result.error, null);
});

test("gemini-like validation treats 400 with unknown body as invalid key", async () => {
  globalThis.fetch = async () => {
    return new Response("not json", { status: 400 });
  };

  const result = await validateGeminiLikeProvider({
    apiKey: "bad-key",
    baseUrl: GEMINI_MODELS_URL,
  });

  assert.equal(result.valid, false);
  assert.equal(result.error, "Invalid API key");
});

test("gemini-like validation treats 429 rate limit as valid key", async () => {
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        error: {
          code: 429,
          message: "You exceeded your current quota.",
          status: "RESOURCE_EXHAUSTED",
        },
      }),
      { status: 429 }
    );
  };

  const result = await validateGeminiLikeProvider({
    apiKey: "valid-but-rate-limited-key",
    baseUrl: GEMINI_MODELS_URL,
  });

  assert.equal(result.valid, true);
  assert.equal(result.error, null);
});

test("gemini-like validation rejects invalid keys via UNAUTHENTICATED status", async () => {
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        error: {
          code: 401,
          message: "Request is missing valid authentication credentials.",
          status: "UNAUTHENTICATED",
          details: [],
        },
      }),
      { status: 401 }
    );
  };

  const result = await validateGeminiLikeProvider({
    apiKey: "bad-key",
    baseUrl: GEMINI_MODELS_URL,
  });

  assert.equal(result.valid, false);
  assert.equal(result.error, "Invalid API key");
});

// Same direct call, for the OAuth header branch: no registered gemini-format provider
// carries authType "oauth" any more (gemini-cli was the only one). The branch stays
// because authType is a parameter, not a registry lookup.
test("a gemini-format provider with OAuth auth uses Bearer, not x-goog-api-key", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers });
    return new Response(
      JSON.stringify({
        models: [{ name: "models/gemini-2.5-flash" }],
      }),
      { status: 200 }
    );
  };

  const result = await validateGeminiLikeProvider({
    apiKey: "oauth-access-token",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    authType: "oauth",
  });

  assert.equal(result.valid, true);
  assert.equal(result.error, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers["Authorization"], "Bearer oauth-access-token");
  assert.equal(calls[0].headers["x-goog-api-key"], undefined);
});

test("vertex validation accepts Service Account JSON shape", async () => {
  const result = await validateProviderApiKey({
    provider: "vertex",
    apiKey: JSON.stringify({
      type: "service_account",
      project_id: "demo-project",
      private_key_id: "abc123",
      private_key: "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----\\n",
      client_email: "svc@demo-project.iam.gserviceaccount.com",
    }),
  });

  assert.equal(result.valid, true);
  assert.equal(result.method, "service_account_json");
});

test("vertex validation rejects malformed Service Account JSON", async () => {
  const result = await validateProviderApiKey({
    provider: "vertex",
    apiKey: JSON.stringify({ type: "service_account", project_id: "demo-project" }),
  });

  assert.equal(result.valid, false);
  assert.match(result.error, /missing client_email or private_key/i);
});

test("vertex validation accepts OAuth access token via tokeninfo", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers });
    return new Response(
      JSON.stringify({
        audience: "32555940559.apps.googleusercontent.com",
        scope: "https://www.googleapis.com/auth/cloud-platform",
        expires_in: 3599,
      }),
      { status: 200 }
    );
  };

  const result = await validateProviderApiKey({
    provider: "vertex",
    apiKey: "ya29.valid-token",
  });

  assert.equal(result.valid, true);
  assert.equal(result.method, "oauth_token_info");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /oauth2\.googleapis\.com\/tokeninfo/);
});

test("vertex validation rejects invalid OAuth access token", async () => {
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("oauth2.googleapis.com/tokeninfo")) {
      return new Response(JSON.stringify({ error: "invalid_token" }), { status: 400 });
    }

    const headers = init.headers || {};
    if (headers.Authorization) {
      return new Response(
        JSON.stringify({
          error: {
            code: 401,
            status: "UNAUTHENTICATED",
            message: "Request had invalid authentication credentials.",
          },
        }),
        { status: 401 }
      );
    }

    return new Response(
      JSON.stringify({
        error: {
          code: 403,
          status: "UNAUTHENTICATED",
          message: "API key not valid. Please pass a valid API key.",
        },
      }),
      { status: 403 }
    );
  };

  const result = await validateProviderApiKey({
    provider: "vertex",
    apiKey: "AQ.invalid-token",
  });

  assert.equal(result.valid, false);
  assert.equal(result.error, "Invalid API key");
});

test("vertex validation treats API-key style credential as valid when Vertex returns permission denied", async () => {
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);

    if (target.includes("oauth2.googleapis.com/tokeninfo")) {
      return new Response(JSON.stringify({ error: "invalid_token" }), { status: 400 });
    }

    const headers = init.headers || {};
    if (headers.Authorization) {
      return new Response(
        JSON.stringify({
          error: {
            code: 401,
            status: "UNAUTHENTICATED",
            message: "Request had invalid authentication credentials.",
          },
        }),
        { status: 401 }
      );
    }

    return new Response(
      JSON.stringify({
        error: {
          code: 403,
          status: "PERMISSION_DENIED",
          message: "Permission denied on resource project vertex-validation-probe.",
        },
      }),
      { status: 403 }
    );
  };

  const result = await validateProviderApiKey({
    provider: "vertex",
    apiKey: "AQ.sample-key",
  });

  assert.equal(result.valid, true);
  assert.equal(result.method, "vertex_inference_probe_apikey");
  assert.match(result.warning, /missing project\/model permission/i);
});
