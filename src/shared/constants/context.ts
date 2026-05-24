/**
 * Defaults for compress layers (when enabled from Dashboard → AI → Request context,
 * or `ROUTIFORM_CONTEXT_VALIDATION` for deployments).
 */
export const CONTEXT_CONFIG: {
  readonly defaultLimit: number;
  readonly reserveTokens: number;
} = {
  defaultLimit: 262144,
  reserveTokens: 8000,
};
