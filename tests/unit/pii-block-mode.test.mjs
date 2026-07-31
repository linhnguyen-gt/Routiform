import test from "node:test";
import assert from "node:assert/strict";

// sanitizePIIResponse and sanitizePIIChunk were exported and called from nowhere — only logging
// used the sanitizer. "block" mode was accepted by config and behaved as pass-through, so fixing
// the mode alone would have converted a known-absent control into a believed-present one.

const { applyPiiPolicy, applyPiiToResponse, PII_BLOCK_MESSAGE } =
  await import("../../open-sse/handlers/chat-core/chat-core-pii-response.ts");

const ENV = ["PII_RESPONSE_SANITIZATION", "PII_RESPONSE_SANITIZATION_MODE"];
const ORIGINAL = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

// Must await the callback before restoring: a sync finally around an async fn restores the env
// before the code under test has read it.
async function withPii(mode, fn) {
  process.env.PII_RESPONSE_SANITIZATION = "true";
  process.env.PII_RESPONSE_SANITIZATION_MODE = mode;
  try {
    return await fn();
  } finally {
    for (const key of ENV) {
      if (ORIGINAL[key] === undefined) delete process.env[key];
      else process.env[key] = ORIGINAL[key];
    }
  }
}

const withEmail = () => ({
  choices: [{ message: { role: "assistant", content: "reach me at jane.doe@example.com" } }],
});

test("block mode withholds a response containing PII", async () => {
  await withPii("block", () => {
    const { body, blocked } = applyPiiPolicy(withEmail());
    assert.equal(blocked, true);
    assert.equal(body.error.message, PII_BLOCK_MESSAGE);
    assert.equal(JSON.stringify(body).includes("jane.doe@example.com"), false);
  });
});

test("block mode passes a clean response through untouched", async () => {
  await withPii("block", () => {
    const clean = { choices: [{ message: { content: "no personal data here" } }] };
    const { body, blocked } = applyPiiPolicy(clean);
    assert.equal(blocked, false);
    assert.equal(body, clean);
  });
});

test("redact mode replaces the match but keeps the response", async () => {
  await withPii("redact", () => {
    const { body, blocked } = applyPiiPolicy(withEmail());
    assert.equal(blocked, false);
    assert.equal(JSON.stringify(body).includes("jane.doe@example.com"), false);
    assert.ok(body.choices[0].message.content.length > 0);
  });
});

test("warn mode leaves the content intact", async () => {
  await withPii("warn", () => {
    const { body, blocked } = applyPiiPolicy(withEmail());
    assert.equal(blocked, false);
    assert.ok(JSON.stringify(body).includes("jane.doe@example.com"));
  });
});

test("the feature is off unless explicitly enabled", () => {
  const { body, blocked } = applyPiiPolicy(withEmail());
  assert.equal(blocked, false);
  assert.ok(JSON.stringify(body).includes("jane.doe@example.com"));
});

test("the response hook is actually reached on a buffered JSON response", async () => {
  await withPii("block", async () => {
    const result = {
      response: new Response(JSON.stringify(withEmail()), {
        headers: { "content-type": "application/json" },
      }),
    };

    await applyPiiToResponse(result);
    const body = await result.response.json();

    assert.equal(body.error?.message, PII_BLOCK_MESSAGE);
    assert.equal(result.response.status, 502);
  });
});

test("a streaming response is left alone — coverage is buffered-only and says so", async () => {
  await withPii("block", async () => {
    const stream = new Response("data: {}\n\n", {
      headers: { "content-type": "text/event-stream" },
    });
    const result = { response: stream };

    await applyPiiToResponse(result);
    assert.equal(result.response, stream, "no unbacked streaming claim");
  });
});
