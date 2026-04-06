-- Add custom endpoint path columns to provider_nodes
-- Allows compatible providers to override default chat/models paths
-- NULL = use default path (backward compatible)
--
-- Columns are applied idempotently in core.ts (ensureProviderNodePathsColumns) before
-- versioned migrations run. This file remains so migration "003" stays recorded for
-- databases that applied the historic ALTER TABLE, and to avoid duplicate ADD COLUMN
-- when the table already has these columns but the migration row was missing.
SELECT 1;
