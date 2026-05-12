DELETE FROM taxonomy_pattern WHERE source='seed' AND created_at >= (
  SELECT MIN(created_at) FROM (
    SELECT created_at FROM taxonomy_pattern WHERE source='seed' ORDER BY created_at DESC LIMIT 1500
  ) t
);
