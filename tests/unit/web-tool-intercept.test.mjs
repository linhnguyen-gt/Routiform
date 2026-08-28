import test from "node:test";
import assert from "node:assert/strict";

const { shouldInterceptWebTools, extractFetchApplyPage, isWebFetchName } =
  await import("../../open-sse/services/webToolDetect.ts");
const { interceptWebTools } = await import("../../open-sse/services/webToolIntercept.ts");
const { parseDuckduckgoHtml } =
  await import("../../open-sse/handlers/search/providers/duckduckgo.ts");
const { selectProvider, SEARCH_PROVIDERS, isKeylessSearchReady } =
  await import("../../open-sse/config/searchRegistry.ts");
const {
  formatSearchText,
  claudeMessage,
  claudeSearchMessage,
  claudeFetchMessage,
  toWebSearchResults,
} = await import("../../open-sse/services/webToolResponse.ts");

test("does not intercept a normal Claude Code toolbag", () => {
  const intercept = shouldInterceptWebTools({
    tools: [
      { name: "Bash", input_schema: { type: "object" } },
      { name: "Read", input_schema: { type: "object" } },
      { name: "WebSearch", input_schema: { type: "object" } },
    ],
  });
  assert.equal(intercept, false);
});

test("intercepts exclusive native web_search tool", () => {
  assert.equal(
    shouldInterceptWebTools({
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
    true
  );
});

test("intercepts exclusive Claude Code WebSearch client tool", () => {
  assert.equal(shouldInterceptWebTools({ tools: [{ name: "WebSearch" }] }), true);
});

test("intercepts exclusive Fetch and WebFetch client tools", () => {
  assert.equal(isWebFetchName("Fetch"), true);
  assert.equal(shouldInterceptWebTools({ tools: [{ name: "Fetch" }] }), true);
  assert.equal(shouldInterceptWebTools({ tools: [{ name: "WebFetch" }] }), true);
});

test("intercepts Claude Code web_fetch_apply nested prompt with empty tools", () => {
  const page = "Trishuli flash flood killed dozens in Rasuwa.";
  const intercept = shouldInterceptWebTools({
    tools: [],
    messages: [
      {
        role: "user",
        content: `Web page content:\n---\n${page}\n---\n\nSummarize casualties.\nProvide a concise response based only on the content above.`,
      },
    ],
  });
  assert.equal(intercept, true);
  assert.equal(extractFetchApplyPage(`Web page content:\n---\n${page}\n---\n\nSummarize.`), page);
});

test("fetch-apply intercept returns page text without provider credentials", async () => {
  const page = "Trishuli flash flood killed dozens in Rasuwa.";
  const response = await interceptWebTools(
    {
      model: "claude-haiku-4-5",
      tools: [],
      messages: [
        {
          role: "user",
          content: `Web page content:\n---\n${page}\n---\n\nSummarize casualties.`,
        },
      ],
    },
    { format: "claude", stream: false }
  );
  assert.ok(response);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.content[0].type, "text");
  assert.equal(body.content[0].text, page);
});

test("does not intercept empty-tools helper after a historical fetch-apply turn", () => {
  assert.equal(
    shouldInterceptWebTools({
      tools: [],
      messages: [
        {
          role: "user",
          content: "Web page content:\n---\nold page\n---\nSummarize.",
        },
        { role: "assistant", content: "ok" },
        { role: "user", content: "1+1" },
      ],
    }),
    false
  );
});

test("does not treat a URL paste in a mixed toolbag as fetch-apply", () => {
  assert.equal(
    shouldInterceptWebTools({
      tools: [{ name: "Bash" }, { name: "Read" }],
      messages: [
        {
          role: "user",
          content: "Web page content:\n---\nshould not intercept\n---\n",
        },
      ],
    }),
    false
  );
});

test("does not intercept OpenAI web_search_preview", () => {
  assert.equal(
    shouldInterceptWebTools({
      tools: [{ type: "web_search_preview" }],
    }),
    false
  );
});

test("intercepts forced WebFetch among other tools", () => {
  assert.equal(
    shouldInterceptWebTools({
      tools: [{ name: "Bash" }, { name: "WebFetch" }],
      tool_choice: { type: "tool", name: "WebFetch" },
    }),
    true
  );
});

test("parseDuckduckgoHtml extracts uddg destinations", () => {
  const html = `
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&amp;rut=abc">Example Docs</a>
    <a class="result__snippet" href="#">Official documentation for Example</a>
  `;
  const parsed = parseDuckduckgoHtml(html);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].url, "https://example.com/docs");
  assert.equal(parsed[0].title, "Example Docs");
  assert.match(parsed[0].snippet, /Official documentation/);
});

test("selectProvider still prefers cheapest keyed provider", () => {
  const config = selectProvider();
  assert.equal(config?.id, "serper-search");
  assert.equal(SEARCH_PROVIDERS["duckduckgo-search"].costPerQuery, 0);
});

test("duckduckgo keyless is ready without env; searxng is not", () => {
  assert.equal(isKeylessSearchReady(SEARCH_PROVIDERS["duckduckgo-search"]), true);
  const original = process.env.SEARXNG_URL;
  delete process.env.SEARXNG_URL;
  delete process.env.SEARXNG_API_BASE;
  assert.equal(isKeylessSearchReady(SEARCH_PROVIDERS["searxng-search"]), false);
  if (original !== undefined) process.env.SEARXNG_URL = original;
});

test("formatSearchText lists results", () => {
  const text = formatSearchText("postgres rls", "duckduckgo-search", [
    { title: "RLS", url: "https://example.com/rls", snippet: "row level security" },
  ]);
  assert.match(text, /postgres rls/);
  assert.match(text, /https:\/\/example.com\/rls/);
  const msg = claudeMessage("cc/haiku", text);
  assert.equal(msg.type, "message");
  assert.equal(msg.content[0].type, "text");
});

test("claudeFetchMessage uses native web_fetch_result blocks", () => {
  const msg = claudeFetchMessage("cc/haiku", "https://example.com/flood", "Trishuli");
  assert.equal(msg.content[0].type, "server_tool_use");
  assert.equal(msg.content[0].name, "web_fetch");
  assert.equal(msg.content[1].type, "web_fetch_tool_result");
  assert.equal(msg.content[1].content.type, "web_fetch_result");
  assert.equal(msg.content[1].content.url, "https://example.com/flood");
  assert.equal(msg.content[1].content.content.source.data, "Trishuli");
  assert.equal(msg.usage.server_tool_use.web_fetch_requests, 1);
});

test("claudeSearchMessage uses native web_search_result blocks", () => {
  const msg = claudeSearchMessage("cc/haiku", "nepal flood", [
    { title: "Floods", url: "https://example.com/flood", snippet: "Trishuli" },
  ]);
  assert.equal(msg.content[0].type, "server_tool_use");
  assert.equal(msg.content[0].name, "web_search");
  assert.equal(msg.content[1].type, "web_search_tool_result");
  assert.equal(msg.content[1].content[0].type, "web_search_result");
  assert.equal(msg.content[1].content[0].url, "https://example.com/flood");
  assert.equal(msg.usage.server_tool_use.web_search_requests, 1);
  assert.match(msg.content[0].id, /^srvtoolu_/);
  assert.equal(toWebSearchResults([{ title: "x", url: "not-a-url", snippet: "" }]).length, 0);
});
