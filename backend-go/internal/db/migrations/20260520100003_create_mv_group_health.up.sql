CREATE MATERIALIZED VIEW IF NOT EXISTS mv_group_health AS
SELECT
    g.id AS group_id,
    g.name,
    COALESCE((SELECT COUNT(*) FROM send_log sl WHERE sl.group_id=g.id AND sl.sent_at > now()-INTERVAL '14 days' AND sl.status='sent'), 0) AS sent_14d,
    COALESCE((SELECT COUNT(*) FROM clicks cl WHERE cl.group_id=g.id AND cl.clicked_at > now()-INTERVAL '14 days'), 0) AS clicks_14d,
    COALESCE((SELECT COUNT(*) FROM send_log sl WHERE sl.group_id=g.id AND sl.sent_at > now()-INTERVAL '14 days' AND sl.status='failed'), 0) AS failed_14d,
    -- ctr_drop_pct: comparação 14d atual vs 14d anterior
    CASE
        WHEN (SELECT COUNT(*) FROM send_log WHERE group_id=g.id AND sent_at BETWEEN now()-INTERVAL '28 days' AND now()-INTERVAL '14 days' AND status='sent') = 0 THEN 0
        ELSE
            (
                COALESCE((SELECT COUNT(*)::float FROM clicks cl WHERE cl.group_id=g.id AND cl.clicked_at BETWEEN now()-INTERVAL '28 days' AND now()-INTERVAL '14 days'), 0) /
                NULLIF((SELECT COUNT(*) FROM send_log WHERE group_id=g.id AND sent_at BETWEEN now()-INTERVAL '28 days' AND now()-INTERVAL '14 days' AND status='sent'), 0)
              -
                COALESCE((SELECT COUNT(*)::float FROM clicks cl WHERE cl.group_id=g.id AND cl.clicked_at > now()-INTERVAL '14 days'), 0) /
                NULLIF((SELECT COUNT(*) FROM send_log WHERE group_id=g.id AND sent_at > now()-INTERVAL '14 days' AND status='sent'), 0)
            ) * 100
    END AS ctr_drop_pct,
    -- sentiment proxy: failed/total
    CASE
        WHEN (SELECT COUNT(*) FROM send_log WHERE group_id=g.id AND sent_at > now()-INTERVAL '14 days') = 0 THEN 0.5
        ELSE 1.0 - (SELECT COUNT(*)::float FROM send_log WHERE group_id=g.id AND sent_at > now()-INTERVAL '14 days' AND status='failed') /
             NULLIF((SELECT COUNT(*) FROM send_log WHERE group_id=g.id AND sent_at > now()-INTERVAL '14 days'), 0)
    END AS sentiment_score,
    now() AS computed_at
FROM groups g
WHERE COALESCE(g.status, 'active') = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_group_health ON mv_group_health (group_id);
