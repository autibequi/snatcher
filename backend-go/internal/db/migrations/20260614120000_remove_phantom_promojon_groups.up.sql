-- Remove os grupos PromoJon "fantasma" do seed: jid IS NULL = nunca conectados ao
-- WhatsApp real (sem conta/admin/jid → travavam o tick e poluíam a lista).
-- Mantém canais/categorias/pesos do seed (config útil). Idempotente.
-- Condição jid IS NULL preserva qualquer grupo PromoJon que o operador tenha
-- conectado a um grupo real (esse passa a ter jid).

-- group_admins não tem ON DELETE CASCADE em todos os caminhos — limpa antes.
DELETE FROM group_admins
WHERE group_id IN (
    SELECT id FROM groups WHERE name LIKE 'PromoJon%' AND jid IS NULL
);

DELETE FROM groups
WHERE name LIKE 'PromoJon%' AND jid IS NULL;
