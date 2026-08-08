-- 029_remove_gemini_connections.sql
-- The `gemini` provider (Google AI Studio, API key) was removed: its registry entry,
-- model-fetch config, synced-available-models path, and Veo video branch are all gone,
-- so a stored connection can no longer be routed anywhere.
--
-- This is a different provider from `gemini-cli`, which migration 028 removed for a
-- different reason (Google restricting third-party OAuth). The Gemini request FORMAT
-- survives both removals — antigravity runs on it.
--
-- Historical rows in usage_history / call_logs / proxy_logs are deliberately left alone:
-- they record requests that really happened, and deleting them would falsify past usage
-- and cost reporting. `DEFAULT_PRICING["gemini"]` is retained for the same reason — cost
-- is recomputed from it at read time. Only live state goes.

DELETE FROM provider_connections WHERE provider = 'gemini';

-- Live quota state for those connections, now orphaned.
DELETE FROM quota_snapshots WHERE provider = 'gemini';

-- Catalogs synced from Google's API per key. These are not their own table: they live in
-- key_value under namespace 'syncedAvailableModels', keyed '<providerId>:<connectionId>'
-- (src/lib/db/models.ts:600). Nothing reads them once the provider is gone.
DELETE FROM key_value WHERE namespace = 'syncedAvailableModels' AND key LIKE 'gemini:%';
