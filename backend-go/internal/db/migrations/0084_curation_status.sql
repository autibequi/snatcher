-- 0084: add curation_status to catalogproduct
ALTER TABLE catalogproduct ADD COLUMN IF NOT EXISTS curation_status TEXT DEFAULT 'pending';
