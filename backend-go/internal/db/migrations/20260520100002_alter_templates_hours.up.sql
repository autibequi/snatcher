ALTER TABLE templates ADD COLUMN IF NOT EXISTS optimal_hours INT[];
ALTER TABLE templates ADD COLUMN IF NOT EXISTS sentiment_target TEXT;
COMMENT ON COLUMN templates.optimal_hours IS 'Horas do dia (0-23) onde template tem maior CTR. NULL = qualquer hora.';
