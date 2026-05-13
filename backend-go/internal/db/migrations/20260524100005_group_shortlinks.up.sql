-- Shortlinks por (group, catalog) — atribuição determinística de cliques.
--
-- ANTES: clicks.group_id era inferido via "último send_log do short_id" —
--   produzindo atribuição errada quando o mesmo produto era enviado a vários
--   grupos. Também tornava impossível distinguir cliques de membros do grupo
--   vs cliques virais (link compartilhado fora).
--
-- AGORA: cada (group, catalog) tem seu próprio short_id. O redirect faz
--   lookup determinístico nessa tabela. Cliques sempre atribuem ao grupo
--   onde a mensagem foi originalmente enviada.

CREATE TABLE IF NOT EXISTS group_shortlinks (
    short_id    TEXT PRIMARY KEY,
    catalog_id  BIGINT NOT NULL REFERENCES catalog(id) ON DELETE CASCADE,
    group_id    BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (catalog_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_group_shortlinks_catalog ON group_shortlinks(catalog_id);
CREATE INDEX IF NOT EXISTS idx_group_shortlinks_group   ON group_shortlinks(group_id);

-- Helper: pega ou cria short_id pra (catalog, group). Retorna 1 linha.
-- 10 chars hex = espaço de ~10^12, baixíssima colisão.
CREATE OR REPLACE FUNCTION ensure_group_shortlink(p_catalog BIGINT, p_group BIGINT)
RETURNS TEXT AS $$
DECLARE v_short TEXT;
BEGIN
    SELECT short_id INTO v_short
    FROM group_shortlinks
    WHERE catalog_id = p_catalog AND group_id = p_group;

    IF v_short IS NOT NULL THEN
        RETURN v_short;
    END IF;

    -- Retry até 5x em caso de colisão (raríssimo).
    FOR i IN 1..5 LOOP
        BEGIN
            v_short := encode(gen_random_bytes(5), 'hex');
            INSERT INTO group_shortlinks (short_id, catalog_id, group_id)
            VALUES (v_short, p_catalog, p_group);
            RETURN v_short;
        EXCEPTION WHEN unique_violation THEN
            -- short_id colidiu OU (catalog, group) já existe — relê.
            SELECT short_id INTO v_short
            FROM group_shortlinks
            WHERE catalog_id = p_catalog AND group_id = p_group;
            IF v_short IS NOT NULL THEN RETURN v_short; END IF;
        END;
    END LOOP;
    RAISE EXCEPTION 'ensure_group_shortlink: 5 colisões consecutivas pra (% , %)', p_catalog, p_group;
END;
$$ LANGUAGE plpgsql;
