/**
 * Normalize upstream error bodies to a JSON-safe payload.
 * Accepts unknown/object/string inputs and guarantees an { error: { ... } } shape.
 */
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function toProviderError(message, type, code, details = undefined) {
  const normalizedMessage =
    typeof message === "string" && message.trim().length > 0
      ? message.trim()
      : "Upstream provider error";
  const normalizedType =
    typeof type === "string" && type.trim().length > 0 ? type.trim() : "upstream_error";
  const normalizedCode =
    typeof code === "string" && code.trim().length > 0 ? code.trim() : normalizedType;

  return {
    error: {
      message: normalizedMessage,
      type: normalizedType,
      code: normalizedCode,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

function normalizeCloudflareEntry(entry) {
  if (typeof entry === "string") {
    return { message: entry };
  }

  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const code =
    typeof record.code === "string" || typeof record.code === "number"
      ? String(record.code)
      : undefined;
  const message =
    typeof record.message === "string"
      ? record.message
      : typeof record.error === "string"
        ? record.error
        : typeof record.description === "string"
          ? record.description
          : undefined;

  return {
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
  };
}

function normalizeCloudflareEnvelope(rawError, fallbackMessage) {
  const root = asRecord(rawError);
  if (!root) return null;

  const candidate =
    root.success === false || Array.isArray(root.errors) || Array.isArray(root.messages)
      ? root
      : asRecord(root.error);
  if (!candidate) return null;

  const errors = Array.isArray(candidate.errors)
    ? candidate.errors.map(normalizeCloudflareEntry).filter(Boolean)
    : [];
  const messages = Array.isArray(candidate.messages)
    ? candidate.messages.map(normalizeCloudflareEntry).filter(Boolean)
    : [];

  if (candidate.success !== false && errors.length === 0 && messages.length === 0) {
    return null;
  }

  const firstDetail = errors[0] || messages[0] || null;
  const message =
    firstDetail?.message ||
    (typeof candidate.error === "string" ? candidate.error : null) ||
    (typeof candidate.message === "string" ? candidate.message : null) ||
    fallbackMessage;
  const code =
    firstDetail?.code ||
    (typeof candidate.code === "string" || typeof candidate.code === "number"
      ? String(candidate.code)
      : "cloudflare_api_error");

  return toProviderError(message, "api_error", code, {
    provider: "cloudflare-ai",
    ...(typeof candidate.success === "boolean" ? { success: candidate.success } : {}),
    ...(errors.length > 0 ? { errors } : {}),
    ...(messages.length > 0 ? { messages } : {}),
  });
}

export function toJsonErrorPayload(rawError, fallbackMessage = "Upstream provider error") {
  const fallback = toProviderError(fallbackMessage, "upstream_error", "upstream_error");

  if (rawError && typeof rawError === "object") {
    const cloudflarePayload = normalizeCloudflareEnvelope(rawError, fallbackMessage);
    if (cloudflarePayload) {
      return cloudflarePayload;
    }

    const errorObj = rawError.error;
    if (typeof errorObj === "string") {
      return toProviderError(errorObj, "upstream_error", "upstream_error");
    }
    if (errorObj && typeof errorObj === "object") {
      return rawError;
    }
    return toProviderError(
      typeof rawError.message === "string" ? rawError.message : fallbackMessage,
      typeof rawError.type === "string" ? rawError.type : "upstream_error",
      typeof rawError.code === "string" ? rawError.code : "upstream_error",
      rawError
    );
  }

  if (typeof rawError === "string") {
    const trimmed = rawError.trim();
    if (!trimmed) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(trimmed);
      return toJsonErrorPayload(parsed, fallbackMessage);
    } catch {
      return toProviderError(trimmed, "upstream_error", "upstream_error");
    }
  }

  return fallback;
}
