-- Engagement decay por grupo (CTR drop, sentiment proxy)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_group_decay AS
SELECT
    g.id AS group_id,
    g.name,
    (SELECT COUNT(*) FROM send_log sl WHERE sl.group_id=g.id AND sl.sent_at > now()-INTERVAL '14 days' AND sl.status='sent') AS sent_14d,
    (SELECT COUNT(*) FROM clicks cl WHERE cl.group_id=g.id AND cl.clicked_at > now()-INTERVAL '14 days') AS clicks_14d,
    (SELECT COUNT(*) FROM send_log sl WHERE sl.group_id=g.id AND sl.sent_at BETWEEN now()-INTERVAL '28 days' AND now()-INTERVAL '14 days' AND sl.status='sent') AS sent_prev_14d,
    (SELECT COUNT(*) FROM clicks cl WHERE cl.group_id=g.id AND cl.clicked_at BETWEEN now()-INTERVAL '28 days' AND now()-INTERVAL '14 days') AS clicks_prev_14d,
    now() AS computed_at
FROM groups g
WHERE COALESCE(g.status, 'active') = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_group_decay ON mv_group_decay (group_id);
