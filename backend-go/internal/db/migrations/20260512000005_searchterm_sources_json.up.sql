-- Convert SearchTerm.sources from ad-hoc string to JSON array
-- This migration handles three legacy values:
-- "all" -> ["ml","amz"]
-- "mercadolivre" -> ["ml"]
-- "amazon" -> ["amz"]
-- Any other value is kept as-is (backward compat for future sources)

UPDATE searchterm SET sources =
    CASE
        WHEN sources = 'all' THEN '["ml","amz"]'
        WHEN sources = 'mercadolivre' THEN '["ml"]'
        WHEN sources = 'amazon' THEN '["amz"]'
        ELSE sources
    END;
