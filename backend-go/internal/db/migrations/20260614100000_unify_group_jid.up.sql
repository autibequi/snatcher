-- Unifica o JID do grupo num único campo `jid`. O `whatsapp_jid` duplicado causava
-- dessincronia: o import gravava `jid`, mas o disparo lia `whatsapp_jid` (grupo nunca
-- recebia mensagem). O código já foi migrado para usar só `jid`; aqui garantimos que
-- `jid` está populado a partir do `whatsapp_jid` antes de remover a coluna.
UPDATE groups
   SET jid = whatsapp_jid
 WHERE (jid IS NULL OR jid = '')
   AND whatsapp_jid IS NOT NULL AND whatsapp_jid <> '';

ALTER TABLE groups DROP COLUMN IF EXISTS whatsapp_jid;
