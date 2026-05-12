-- Limite de grupos por dispatch + cursor de rotação; throttle Evolution + cursor WA round-robin.

ALTER TABLE channel_automations ADD COLUMN IF NOT EXISTS max_groups_per_dispatch INT NOT NULL DEFAULT 1;
ALTER TABLE channel_automations ADD COLUMN IF NOT EXISTS auto_match_next_group_idx INT NOT NULL DEFAULT 0;

ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS dispatch_min_interval_ms INT NOT NULL DEFAULT 0;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS dispatch_wa_rr_cursor INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN channel_automations.max_groups_per_dispatch IS 'Máximo de grupos por dispatch automático; 1 evita broadcast acidental; >= N usa todos os grupos.';
COMMENT ON COLUMN channel_automations.auto_match_next_group_idx IS 'Índice circular para rotação de grupos entre ciclos (compartilhado com worker).';
COMMENT ON COLUMN appconfig.dispatch_min_interval_ms IS 'Pausa mínima entre envios Evolution no dispatch worker (0=desligado).';
COMMENT ON COLUMN appconfig.dispatch_wa_rr_cursor IS 'Cursor global para round-robin de contas WA quando não há conta preferida no grupo/target.';
