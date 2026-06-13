-- Remove a trava de unicidade. As duplicatas removidas no up não são restauradas.
DROP INDEX IF EXISTS uq_groups_platform_jid;
