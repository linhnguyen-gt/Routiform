// Token expiry buffer (refresh if expires within 5 minutes)
export const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
export const REFRESH_LEAD_MS = {
  claude: 4 * 60 * 60 * 1000,
};

export function getRefreshLeadMs(provider) {
  return REFRESH_LEAD_MS[provider] || TOKEN_EXPIRY_BUFFER_MS;
}
