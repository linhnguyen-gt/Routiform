"use client";

import { memo } from "react";
import { Streamdown } from "streamdown";

import { isSafeImageSrc, isSafeLinkHref } from "@/lib/chat/markdown-safety";

/**
 * Renders model-authored markdown.
 *
 * Streamdown (not react-markdown) because it repairs INCOMPLETE markdown at the
 * raw-string level before parsing: an unterminated ``` fence mid-stream renders
 * as a code block rather than as raw text with stray backticks.
 *
 * The `img` and `a` overrides are the security boundary — see lib/chat/markdown-safety.
 * Streamdown exposes `linkSafety` and `allowedTags` but has no image-origin
 * allowlist, so image policy has to be enforced here.
 */

interface MarkdownMessageProps {
  content: string;
  /** True while tokens are still arriving — enables incomplete-markdown repair. */
  streaming?: boolean;
}

function BlockedImage({ alt }: { alt?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-xs text-amber-700 dark:text-amber-300"
      title="Blocked: a remote image would leak this conversation to its host the moment it rendered."
    >
      <span className="material-symbols-outlined text-[14px]">block</span>
      Remote image blocked{alt ? `: ${alt}` : ""}
    </span>
  );
}

export const MarkdownMessage = memo(function MarkdownMessage({
  content,
  streaming = false,
}: MarkdownMessageProps) {
  return (
    <Streamdown
      parseIncompleteMarkdown={streaming}
      className="prose-chat max-w-none text-sm leading-relaxed text-text-main"
      components={{
        img: ({ src, alt }) => {
          const source = typeof src === "string" ? src : undefined;
          // A remote <img> fires its GET on render, with no click. That request
          // is the exfiltration channel; the model does not get to open it.
          if (!isSafeImageSrc(source)) return <BlockedImage alt={alt} />;
          // eslint-disable-next-line @next/next/no-img-element -- data:/blob: sources, not optimizable
          return <img src={source} alt={alt ?? ""} className="max-w-full rounded-lg" />;
        },
        a: ({ href, children }) => {
          const target = typeof href === "string" ? href : undefined;
          if (!isSafeLinkHref(target)) {
            // Render the text, drop the href. A javascript: URL on this page has
            // cookies for every management API.
            return <span className="text-text-muted underline decoration-dotted">{children}</span>;
          }
          return (
            <a
              href={target}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </Streamdown>
  );
});
