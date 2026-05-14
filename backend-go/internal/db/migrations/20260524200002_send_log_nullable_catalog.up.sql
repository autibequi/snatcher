-- send_log.catalog_id nullable: disparos manuais (message_override) não têm produto associado
ALTER TABLE send_log ALTER COLUMN catalog_id DROP NOT NULL;
