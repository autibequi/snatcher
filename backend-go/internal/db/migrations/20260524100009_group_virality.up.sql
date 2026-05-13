-- View observacional de viralização externa por grupo nos últimos 30d.
-- Não influencia scoring — só usada na UI/admin pra detectar grupos
-- cujos links viralizam fora (alto valor de cobertura).
--
-- virality_ratio = clicks_excedentes / clicks_total
--   clicks_excedentes = clicks - (k * member_count * envios_distintos)
--
-- ratio 0.0 = todos clicks dentro do esperado
-- ratio 0.5 = metade dos clicks vieram de viralização externa
-- ratio 0.9 = grupo é "altavoz" — links bombam fora

CREATE OR REPLACE VIEW group_virality AS
WITH base AS (
    SELECT cl.group_id,
           COUNT(*)::numeric AS clicks_total,
           COUNT(DISTINCT cl.short_id)::numeric AS unique_links
    FROM clicks cl
    WHERE cl.clicked_at > now() - INTERVAL '30 days'
      AND cl.group_id IS NOT NULL
    GROUP BY cl.group_id
),
caps AS (
    SELECT b.group_id, b.clicks_total, b.unique_links,
           g.member_count,
           b.unique_links * GREATEST(g.member_count, 1)
             * COALESCE(get_param('click_cap_per_member','global',NULL), 3.0) AS expected_max
    FROM base b
    JOIN groups g ON g.id = b.group_id
)
SELECT group_id,
       clicks_total::bigint                              AS clicks_total,
       unique_links::bigint                              AS unique_links,
       member_count,
       expected_max::bigint                              AS expected_max,
       GREATEST(clicks_total - expected_max, 0)::bigint  AS clicks_excedentes,
       CASE WHEN clicks_total > 0
            THEN GREATEST(clicks_total - expected_max, 0) / clicks_total
            ELSE 0 END                                   AS virality_ratio
FROM caps;
