/**
 * Intercept Claude Code / Anthropic native web_search and web_fetch tools
 * so they do not require provider "claude" credentials.
 */
import { handleSearch } from "../handlers/search.ts";
import { listSearchChain } from "./searchBackend.ts";
import { fetchWebPage } from "./webFetch.ts";
import {
  extractFetchApplyPage,
  forcedToolName,
  isClaudeCodeFetchApply,
  isWebFetchName,
  isWebSearchName,
  shouldInterceptWebTools,
  toolKind,
} from "./webToolDetect.ts";
import {
  claudeFetchMessage,
  claudeFetchSse,
  claudeMessage,
  claudeSearchMessage,
  claudeSearchSse,
  claudeSse,
  formatSearchText,
  openaiMessage,
  openaiSse,
  webToolHttpResponse,
  type SearchHit,
} from "./webToolResponse.ts";
import type { PromptUsageSnapshot } from "./promptUsageMemory.ts";

export { shouldInterceptWebTools };

type JsonRecord = Record<string, unknown>;

const URL_RE = /https?:\/\/[^\s<>"'`]+/i;

function collectText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const rec = part as JsonRecord;
      if (typeof rec.text === "string") return rec.text;
      if (typeof rec.content === "string") return rec.content;
      if (typeof rec.url === "string") return rec.url;
      if (rec.type === "tool_use" && rec.input && typeof rec.input === "object") {
        const input = rec.input as JsonRecord;
        if (typeof input.query === "string") return input.query;
        if (typeof input.url === "string") return input.url;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function lastUserText(body: JsonRecord): string {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || typeof msg !== "object") continue;
    const rec = msg as JsonRecord;
    if (rec.role !== "user") continue;
    const text = collectText(rec.content).trim();
    if (text) return text;
  }
  if (typeof body.input === "string") return body.input.trim();
  return collectText(body.input).trim();
}

function interceptKind(body: JsonRecord): "search" | "fetch" | "fetch-apply" {
  if (isClaudeCodeFetchApply(body)) return "fetch-apply";
  const forced = forcedToolName(body.tool_choice);
  if (forced && isWebFetchName(forced)) return "fetch";
  if (forced && isWebSearchName(forced)) return "search";
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const kinds = tools
    .filter((t): t is JsonRecord => !!t && typeof t === "object")
    .map((t) => toolKind(t));
  const hasFetch = kinds.includes("fetch");
  const hasSearch = kinds.includes("search");
  if (hasFetch && !hasSearch) return "fetch";
  return "search";
}

function extractUrl(text: string): string | null {
  const match = text.match(URL_RE);
  return match ? match[0].replace(/[),.;]+$/, "") : null;
}

export async function interceptWebTools(
  body: JsonRecord,
  options: {
    format: string;
    stream: boolean;
    log?: {
      info?: (tag: string, message: string) => void;
      warn?: (tag: string, message: string) => void;
      error?: (tag: string, message: string) => void;
    };
    promptUsage?: PromptUsageSnapshot | null;
  }
): Promise<Response | null> {
  if (!shouldInterceptWebTools(body)) return null;

  const model = typeof body.model === "string" ? body.model : "web-tools";
  const kind = interceptKind(body);
  const userText = lastUserText(body);
  const isClaude = options.format === "claude";
  const promptUsage = options.promptUsage;

  try {
    if (kind === "fetch-apply") {
      const page = extractFetchApplyPage(userText) || userText;
      if (options.stream) {
        return webToolHttpResponse(
          isClaude ? claudeSse(model, page, promptUsage) : openaiSse(model, page),
          true
        );
      }
      return webToolHttpResponse(
        isClaude ? claudeMessage(model, page, promptUsage) : openaiMessage(model, page)
      );
    }

    if (kind === "fetch") {
      const url = extractUrl(userText);
      if (!url) {
        const text = "Web fetch failed: no URL found in the request.";
        if (options.stream) {
          return webToolHttpResponse(
            isClaude ? claudeSse(model, text, promptUsage) : openaiSse(model, text),
            true
          );
        }
        return webToolHttpResponse(
          isClaude ? claudeMessage(model, text, promptUsage) : openaiMessage(model, text)
        );
      }
      const fetched = await fetchWebPage(url);
      if (options.stream) {
        return webToolHttpResponse(
          isClaude
            ? claudeFetchSse(model, fetched.url, fetched.text, promptUsage)
            : openaiSse(model, fetched.text),
          true
        );
      }
      return webToolHttpResponse(
        isClaude
          ? claudeFetchMessage(model, fetched.url, fetched.text, promptUsage)
          : openaiMessage(model, fetched.text)
      );
    }

    const query = (userText.replace(URL_RE, " ").trim() || userText).slice(0, 500);
    const chain = await listSearchChain();
    let lastError = "unknown error";
    let hits: SearchHit[] = [];
    let providerLabel = "web_search";
    if (chain.length === 0) {
      lastError =
        "Web search is unavailable. Add a search provider API key in the dashboard, or set SEARXNG_URL.";
    } else {
      for (const pick of chain) {
        const result = await handleSearch({
          query,
          provider: pick.config.id,
          maxResults: Math.min(8, pick.config.defaultMaxResults),
          searchType: "web",
          credentials: pick.credentials,
          log: options.log,
        });
        if (result.success && result.data) {
          hits = result.data.results.map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
            published_at: r.published_at,
          }));
          providerLabel = result.data.provider;
          lastError = "";
          break;
        }
        lastError = result.error || lastError;
      }
    }

    if (isClaude) {
      const payload =
        lastError && hits.length === 0
          ? claudeMessage(model, `Web search failed: ${lastError}`, promptUsage)
          : claudeSearchMessage(model, query, hits, promptUsage);
      if (options.stream) {
        const sse =
          lastError && hits.length === 0
            ? claudeSse(model, `Web search failed: ${lastError}`, promptUsage)
            : claudeSearchSse(model, query, hits, promptUsage);
        return webToolHttpResponse(sse, true);
      }
      return webToolHttpResponse(payload);
    }

    const text =
      lastError && hits.length === 0
        ? `Web search failed: ${lastError}`
        : formatSearchText(query, providerLabel, hits);
    if (options.stream) return webToolHttpResponse(openaiSse(model, text), true);
    return webToolHttpResponse(openaiMessage(model, text));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    options.log?.warn?.("WEB_TOOLS", `intercept failed: ${message}`);
    const text =
      kind === "fetch" ? `Web fetch failed: ${message}` : `Web search failed: ${message}`;
    if (options.stream) {
      return webToolHttpResponse(
        isClaude ? claudeSse(model, text, promptUsage) : openaiSse(model, text),
        true
      );
    }
    return webToolHttpResponse(
      isClaude ? claudeMessage(model, text, promptUsage) : openaiMessage(model, text)
    );
  }
}
