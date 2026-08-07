-- 028_remove_gemini_cli_connections.sql
-- The gemini-cli provider was removed: Google restricts third-party OAuth usage
-- for Gemini CLI, and the executor, OAuth flow, and registry entry are gone.
-- Stored connections for it are unroutable, so they are deleted rather than left
-- in the UI as rows that fail every request. Use the `gemini` (API key) provider.
--
-- The migration runner classifies DELETE FROM as risky and takes a full
-- pre-migration snapshot into db_backups/ before applying this file.
--
-- Historical rows in usage_history / call_logs / proxy_logs are deliberately
-- left alone: they record requests that really happened, and removing them
-- would falsify past usage and cost reporting. Only live state goes.

DELETE FROM provider_connections WHERE provider = 'gemini-cli';

-- Live quota state for those connections, now orphaned.
DELETE FROM quota_snapshots WHERE provider = 'gemini-cli';
