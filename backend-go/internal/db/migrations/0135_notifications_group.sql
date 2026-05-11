-- 0135: grupo de notificações operacionais (relatórios Jonfrey, resumos de
-- disparo, eventos relevantes). Aponta para um grupo já cadastrado em groups
-- (mesma tabela usada por canais), via FK soft (sem cascade) para não derrubar
-- config se o grupo for arquivado — só vira NULL e o notifier silencia.
ALTER TABLE appconfig
    ADD COLUMN IF NOT EXISTS notifications_group_id BIGINT
        REFERENCES groups(id) ON DELETE SET NULL;
