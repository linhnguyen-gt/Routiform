"use client";

import { Button, Modal } from "@/shared/components";
import { useMemo, useState } from "react";

import {
  BULK_KEY_IMPORT_MAX,
  nextKeyNames,
  parseBulkKeys,
  runBulkKeyImport,
  type BulkImportOutcome,
  type BulkKeyCreateOutcome,
  type NamedBulkKey,
} from "@/shared/utils/bulk-key-import";

interface ProviderDetailBulkImportKeysModalProps {
  isOpen: boolean;
  provider: string;
  providerName?: string;
  /** Names of the provider's existing connections — the `Key N` counter starts above these. */
  existingNames: string[];
  onImported: () => void | Promise<void>;
  onClose: () => void;
}

/**
 * Posts one key to the existing single-key create route. The bulk layer adds no second insert
 * path, so validation, encryption, and the audit event are whatever `POST /api/providers` already
 * does; a 409 `duplicate_credential` is the server saying this value is already stored.
 */
async function createConnection(
  provider: string,
  item: NamedBulkKey
): Promise<BulkKeyCreateOutcome> {
  const res = await fetch("/api/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      name: item.name,
      apiKey: item.value,
      authType: "apikey",
      testStatus: "unknown",
    }),
  });

  if (res.ok) return { status: "added" };

  const data = await res.json().catch(() => ({}));
  const error = data?.error;
  const message =
    (typeof error === "string" ? error : error?.message) || `Request failed (${res.status})`;

  if (res.status === 409 || error?.code === "duplicate_credential") {
    return { status: "skipped", reason: message };
  }
  return { status: "failed", reason: message };
}

export function ProviderDetailBulkImportKeysModal({
  isOpen,
  provider,
  providerName,
  existingNames,
  onImported,
  onClose,
}: ProviderDetailBulkImportKeysModalProps) {
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcome, setOutcome] = useState<BulkImportOutcome | null>(null);

  const parsed = useMemo(() => parseBulkKeys(text), [text]);
  const planned = useMemo(
    () => nextKeyNames(parsed.values, existingNames),
    [parsed.values, existingNames]
  );
  const overCap = parsed.values.length > BULK_KEY_IMPORT_MAX;

  const handleImport = async () => {
    if (planned.length === 0 || overCap) return;
    setImporting(true);
    setOutcome(null);
    setProgress({ done: 0, total: planned.length });
    try {
      const result = await runBulkKeyImport(
        planned,
        (item) => createConnection(provider, item),
        (done, total) => setProgress({ done, total })
      );
      setOutcome(result);
      // Key material must not linger in the DOM once it has been stored.
      if (result.added > 0) setText("");
      await onImported();
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setText("");
    setOutcome(null);
    setProgress({ done: 0, total: 0 });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      title={`Bulk import API keys — ${providerName || provider}`}
      onClose={handleClose}
    >
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="bulk-key-import-textarea" className="mb-1 block text-sm font-medium">
            Paste keys
          </label>
          <textarea
            id="bulk-key-import-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={"sk-key-one\nsk-key-two\nsk-key-three"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
          />
          <p className="mt-1 text-xs text-text-muted">
            One key per line, or separated by <code>|</code>. Blank entries and repeats within the
            paste are dropped. A key containing a line break or a <code>|</code> has to be added
            through the single-key form instead.
          </p>
        </div>

        {parsed.values.length > 0 && (
          <div className="rounded-lg border border-border bg-bg-subtle px-3 py-2 text-xs">
            <p className="font-medium">
              {parsed.values.length} key{parsed.values.length === 1 ? "" : "s"} to import
              {parsed.dropped > 0 ? ` · ${parsed.dropped} dropped` : ""}
            </p>
            {!overCap && (
              <p className="mt-1 text-text-muted">
                Will be named {planned[0]?.name}
                {planned.length > 1 ? ` … ${planned[planned.length - 1]?.name}` : ""}
              </p>
            )}
          </div>
        )}

        {overCap && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {parsed.values.length} keys exceeds the limit of {BULK_KEY_IMPORT_MAX} per import.
            Remove {parsed.values.length - BULK_KEY_IMPORT_MAX} and try again.
          </div>
        )}

        {importing && progress.total > 0 && (
          <p className="text-sm text-text-muted">
            Importing {progress.done} of {progress.total}…
          </p>
        )}

        {outcome && (
          <div className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 text-sm">
            <p className="font-medium">
              {outcome.added} added · {outcome.skippedDuplicate} already stored · {outcome.failed}{" "}
              failed
            </p>
            {outcome.results
              .filter((r) => r.status !== "added")
              .map((r) => (
                <p key={r.name} className="text-xs text-text-muted">
                  <span className="font-mono">{r.name}</span>:{" "}
                  {r.status === "skipped" ? "already stored" : "failed"}
                  {r.reason ? ` — ${r.reason}` : ""}
                </p>
              ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleClose} variant="ghost" fullWidth>
            Close
          </Button>
          <Button
            onClick={() => void handleImport()}
            fullWidth
            disabled={planned.length === 0 || overCap || importing}
          >
            {importing ? "Importing…" : `Import ${planned.length || ""}`.trim()}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
