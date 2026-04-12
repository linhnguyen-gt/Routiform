/**
 * Request context for chat completion handlers.
 * Encapsulates all parameters needed for processing a chat request.
 */
type JsonRecord = Record<string, unknown>;

export interface ChatRequestContext {
  /** Request body (OpenAI/Claude/etc. format) */
  body: JsonRecord;

  /** Model routing information */
  modelInfo: {
    provider: string;
    model: string;
    extendedContext?: boolean;
  };

  /** Provider credentials (API keys, tokens, etc.) */
  credentials: JsonRecord;

  /** Logger instance for request tracing */
  log?: {
    info?: (tag: string, message: string) => void;
    warn?: (tag: string, message: string) => void;
    error?: (tag: string, message: string) => void;
  } | null;

  /** Callback when credentials are refreshed */
  onCredentialsRefreshed?: () => void;

  /** Callback when request succeeds (to clear error status) */
  onRequestSuccess?: () => void;

  /** Callback when client disconnects */
  onDisconnect?: () => void;

  /** Raw client request (headers, endpoint, etc.) */
  clientRawRequest?: {
    headers?: Record<string, string | string[] | undefined>;
    endpoint?: string;
  };

  /** Connection ID for usage tracking and settings lookup */
  connectionId?: string | null;

  /** API key metadata for usage attribution */
  apiKeyInfo?: {
    id?: string;
    name?: string;
    noLog?: boolean;
  } | null;

  /** Client user agent for caching decisions */
  userAgent?: string;

  /** Combo name if this is a combo request */
  comboName?: string;

  /** Combo routing strategy (e.g., 'priority', 'cost-optimized') */
  comboStrategy?: string | null;

  /** Whether this request is from a combo */
  isCombo?: boolean;

  /** Combo configuration object */
  combo?: JsonRecord;
}

/**
 * Model information for routing decisions.
 */
export interface ModelInfo {
  provider: string;
  model: string;
  extendedContext?: boolean;
}

/**
 * API key metadata for usage attribution and logging.
 */
export interface ApiKeyInfo {
  id?: string;
  name?: string;
  noLog?: boolean;
}

/**
 * Logger interface for request tracing.
 */
export interface Logger {
  info?: (tag: string, message: string) => void;
  warn?: (tag: string, message: string) => void;
  error?: (tag: string, message: string) => void;
}
