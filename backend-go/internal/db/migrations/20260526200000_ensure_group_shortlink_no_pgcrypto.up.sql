-- ensure_group_shortlink usava gen_random_bytes() (extensão pgcrypto).
-- Muitos Postgres geridos não têm pgcrypto habilitado → função inexistente.
-- Gera os mesmos 10 caracteres hex (equivalente a 5 bytes aleatórios) via md5+substring.

CREATE OR REPLACE FUNCTION ensure_group_shortlink(p_catalog BIGINT, p_group BIGINT)
RETURNS TEXT AS $$
DECLARE v_short TEXT;
BEGIN
    SELECT short_id INTO v_short
    FROM group_shortlinks
    WHERE catalog_id = p_catalog AND group_id = p_group;
    IF v_short IS NOT NULL THEN RETURN v_short; END IF;
    FOR i IN 1..5 LOOP
        BEGIN
            v_short := substring(
                md5(random()::text || clock_timestamp()::text || random()::text || i::text || p_catalog::text || p_group::text)
                from 1 for 10
            );
            INSERT INTO group_shortlinks (short_id, catalog_id, group_id)
            VALUES (v_short, p_catalog, p_group);
            RETURN v_short;
        EXCEPTION WHEN unique_violation THEN
            SELECT short_id INTO v_short
            FROM group_shortlinks
            WHERE catalog_id = p_catalog AND group_id = p_group;
            IF v_short IS NOT NULL THEN RETURN v_short; END IF;
        END;
    END LOOP;
    RAISE EXCEPTION 'ensure_group_shortlink: colisões esgotadas para (%, %)', p_catalog, p_group;
END;
$$ LANGUAGE plpgsql;
