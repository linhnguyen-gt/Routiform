import { injectModelTag } from "../comboAgentMiddleware.ts";

type ComboLike = { context_cache_protection?: boolean };

/**
 * When context_cache_protection is enabled, wrap upstream handler to inject
 * routiformModel tag (non-stream JSON / SSE) and strip visible tag leakage.
 */
export function createHandleSingleModelWrapped(
  combo: ComboLike,
  handleSingleModel: (body: unknown, modelStr: string) => Promise<Response>,
  _log: { info: (tag: string, msg: string) => void }
): (body: unknown, modelStr: string) => Promise<Response> {
  if (!combo.context_cache_protection) {
    return handleSingleModel;
  }

  return async (b: { stream?: boolean } & Record<string, unknown>, modelStr: string) => {
    const res = await handleSingleModel(b, modelStr);
    if (!res.ok) return res;

    if (!b.stream) {
      try {
        const json = (await res.clone().json()) as {
          choices?: Array<{ message?: Record<string, unknown> }>;
        };
        const choice = json?.choices?.[0];
        if (choice?.message) {
          const tagged = injectModelTag([choice.message], modelStr);
          const taggedMsg = tagged[tagged.length - 1];
          const updatedJson = {
            ...json,
            choices: [{ ...choice, message: taggedMsg }, ...(json.choices?.slice(1) || [])],
          };
          return new Response(JSON.stringify(updatedJson), {
            status: res.status,
            headers: res.headers,
          });
        }
      } catch {
        /* non-JSON — skip tagging */
      }
      return res;
    }

    if (!res.body) return res;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let tagInjected = false;

    const transform = new TransformStream({
      transform(chunk, controller) {
        if (tagInjected) {
          controller.enqueue(chunk);
          return;
        }

        const text = decoder.decode(chunk, { stream: true });

        // Best-effort in-stream pin: only append the tag onto the FIRST chunk
        // that already carries a content delta. We never emit a tag-only delta
        // chunk — that pattern caused some clients (notably OpenClaw control
        // UI) to render the tag as a separate empty assistant bubble, doubling
        // the visible message count (see plan 260531-1214-request-dedupe).
        const contentMatch = text.match(/"content":"([^"]+)/);
        if (contentMatch) {
          const tagContent = `<routiformModel>${modelStr}</routiformModel>`;
          const injected = text.replace(
            /"content":"([^"]+)/,
            `"content":"${tagContent.replace(/"/g, '\\"')}$1`
          );
          tagInjected = true;
          controller.enqueue(encoder.encode(injected));
          return;
        }

        controller.enqueue(chunk);
      },
      // Intentionally no flush() injection: when the upstream response has no
      // content delta (pure tool_calls), the X-Routiform-Model header below is
      // the only pin signal sent to the client. This avoids the duplicate
      // assistant-bubble artifact reported with tag-only deltas.
    });

    const sanitizeDecoder = new TextDecoder();
    const sanitize = new TransformStream({
      transform(chunk, controller) {
        const text = sanitizeDecoder.decode(chunk, { stream: true });
        if (text) {
          if (text.includes("<routiformModel>")) {
            const cleaned = text.replace(
              /(?:\\n|\n)?<routiformModel>[^<]+<\/routiformModel>(?:\\n|\n)?/g,
              ""
            );
            if (cleaned) controller.enqueue(encoder.encode(cleaned));
          } else {
            controller.enqueue(encoder.encode(text));
          }
        }
      },
      flush(controller) {
        const tail = sanitizeDecoder.decode();
        if (tail) {
          if (tail.includes("<routiformModel>")) {
            const cleaned = tail.replace(
              /(?:\\n|\n)?<routiformModel>[^<]+<\/routiformModel>(?:\\n|\n)?/g,
              ""
            );
            if (cleaned) controller.enqueue(encoder.encode(cleaned));
          } else {
            controller.enqueue(encoder.encode(tail));
          }
        }
      },
    });

    const transformedStream = res.body.pipeThrough(transform).pipeThrough(sanitize);
    const headers = new Headers(res.headers);
    headers.set("X-Routiform-Model", modelStr);
    return new Response(transformedStream, {
      status: res.status,
      headers,
    });
  };
}
