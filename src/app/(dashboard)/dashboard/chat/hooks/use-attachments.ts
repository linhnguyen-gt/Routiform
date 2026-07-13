"use client";

import { useCallback, useState } from "react";

/**
 * Files staged for the next turn.
 *
 * Uploaded immediately on drop/pick, so the composer holds a hash rather than the bytes. That
 * is what keeps useChat's per-turn re-POST of the whole message array small enough to clear the
 * 10 MB body cap (see lib/chat/rehydrate-attachments).
 */

export interface PendingAttachment {
  sha256: string;
  mime: string;
  bytes: number;
  kind: "image" | "text";
  filename: string;
}

interface UploadResponse extends PendingAttachment {
  error?: string;
}

export function useAttachments() {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const add = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setUploading(true);
    setUploadError(null);

    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);

        const res = await fetch("/api/attachments", { method: "POST", body: form });
        const data = (await res.json().catch(() => null)) as UploadResponse | null;

        if (!res.ok || !data?.sha256) {
          // Surface the server's reason (too large, not an image, binary) rather than a
          // generic failure — the user can act on the real one.
          setUploadError(data?.error ?? "Upload failed.");
          continue;
        }

        setAttachments((current) =>
          // Content-addressed: the same file picked twice is one attachment, not two.
          current.some((a) => a.sha256 === data.sha256) ? current : [...current, data]
        );
      }
    } finally {
      setUploading(false);
    }
  }, []);

  const remove = useCallback((sha256: string) => {
    setAttachments((current) => current.filter((a) => a.sha256 !== sha256));
  }, []);

  const clear = useCallback(() => {
    setAttachments([]);
    setUploadError(null);
  }, []);

  return { attachments, add, remove, clear, uploading, uploadError };
}
