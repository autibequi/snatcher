-- Importar grupo antes de vincular a um canal (groups.channel_id opcional).
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_channel_id_fkey;
ALTER TABLE groups ALTER COLUMN channel_id DROP NOT NULL;
ALTER TABLE groups ADD CONSTRAINT groups_channel_id_fkey
  FOREIGN KEY (channel_id) REFERENCES channel(id) ON DELETE CASCADE;
