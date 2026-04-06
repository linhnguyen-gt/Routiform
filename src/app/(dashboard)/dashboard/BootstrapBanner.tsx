"use client";

import { useState } from "react";

/**
 * Shown when Routiform was started with auto-generated secrets (zero-config mode).
 * The banner is dismissable and persists only for the current session.
 *
 * `serverEnvPath` is the real on-disk path from the server (respects DATA_DIR — e.g. /app/data/server.env in Docker).
 */
export default function BootstrapBanner({ serverEnvPath }: { serverEnvPath: string }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const displayPath =
    serverEnvPath ||
    (typeof navigator !== "undefined" && navigator.platform?.startsWith("Win")
      ? "%APPDATA%\\routiform\\server.env"
      : "~/.routiform/server.env");

  const dockerNote =
    displayPath.startsWith("/app/") || displayPath.includes("/app/data/")
      ? " In Docker this path is inside your container volume (see DATA_DIR in compose)."
      : "";

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 mb-4"
    >
      <span className="text-amber-400 text-base shrink-0 mt-0.5">⚠️</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-amber-300">Running in zero-config mode</p>
        <p className="mt-0.5 text-amber-200/80">
          Routiform auto-generated secure encryption keys on first launch. They are persisted to{" "}
          <code className="font-mono bg-amber-500/20 px-1 rounded text-xs break-all">{displayPath}</code>
          . No action is required — your data is encrypted and safe.{dockerNote} To use custom keys, add{" "}
          <code className="font-mono bg-amber-500/20 px-1 rounded text-xs">JWT_SECRET</code> and{" "}
          <code className="font-mono bg-amber-500/20 px-1 rounded text-xs">
            STORAGE_ENCRYPTION_KEY
          </code>{" "}
          to that file (or set them in your container env / compose file — they override on startup).
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-amber-400/60 hover:text-amber-300 transition-colors ml-1"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
