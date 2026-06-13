-- Grupos WhatsApp duplicavam: a checagem de conflito (platform+jid) nunca casava com
-- jid NULL, e o retry de import do front recriava o grupo quando a resposta dava timeout.
-- Esta trava garante unicidade física de (platform, jid) para grupos reais.

-- Dedupe defensivo: se houver duplicatas com jid (de qualquer ambiente), mantém o menor id.
DELETE FROM groups a
 USING groups b
 WHERE a.jid IS NOT NULL
   AND a.platform = b.platform
   AND a.jid = b.jid
   AND a.id > b.id;

-- Índice parcial: placeholders/seeds (jid NULL) seguem permitidos; grupos reais não duplicam.
CREATE UNIQUE INDEX IF NOT EXISTS uq_groups_platform_jid
    ON groups (platform, jid)
 WHERE jid IS NOT NULL;
