// All intercepted domains + URL patterns per tool

export const TARGET_HOSTS = [
  "daily-cloudcode-pa.googleapis.com",
  "cloudcode-pa.googleapis.com",
  "api.individual.githubcopilot.com",
  "q.us-east-1.amazonaws.com",
  "api2.cursor.sh",
];

export const URL_PATTERNS: Record<string, string[]> = {
  antigravity: [":generateContent", ":streamGenerateContent"],
  copilot: ["/chat/completions", "/v1/messages", "/responses"],
  kiro: ["/generateAssistantResponse"],
  cursor: ["/BidiAppend", "/RunSSE", "/RunPoll", "/Run"],
};

export const MODEL_SYNONYMS: Record<string, Record<string, string>> = {
  antigravity: {
    "gemini-default": "gemini-3-flash",
    "gemini-3.8-flash": "gemini-3.8-flash-high",
  },
};

export const LOG_BLACKLIST_URL_PARTS = [
  "recordCodeAssistMetrics",
  "recordTrajectoryAnalytics",
  "fetchAdminControls",
  "listExperiments",
  "fetchUserInfo",
];

export function getToolForHost(host: string): string | null {
  const h = (host || "").split(":")[0];
  if (h === "api.individual.githubcopilot.com") return "copilot";
  if (h === "daily-cloudcode-pa.googleapis.com" || h === "cloudcode-pa.googleapis.com")
    return "antigravity";
  if (h === "q.us-east-1.amazonaws.com") return "kiro";
  if (h === "api2.cursor.sh") return "cursor";
  return null;
}
