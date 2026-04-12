-- Migration 019: Add sort_order column to combos table for persistent drag-to-reorder
-- Backfill existing rows with row-number ordering by name (stable default)

ALTER TABLE combos ADD COLUMN sort_order INTEGER DEFAULT 0;
