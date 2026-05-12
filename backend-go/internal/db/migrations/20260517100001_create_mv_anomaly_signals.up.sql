-- View materializada com sinais de anomalia: ban_rate, error_rate, delivery_drop por modem/grupo
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_anomaly_signals AS
SELECT
    'modem'::text AS scope,
    m.id::bigint AS scope_id,
    m.slug AS scope_label,
    (SELECT COUNT(*) FROM ban_events b WHERE b.modem_id=m.id AND b.detected_at > now()-INTERVAL '24h') AS bans_24h,
    (SELECT COUNT(*) FROM send_log sl JOIN accounts a ON a.id=sl.account_id WHERE a.modem_id=m.id AND sl.sent_at > now()-INTERVAL '24h' AND sl.status='failed') AS failed_24h,
    (SELECT COUNT(*) FROM send_log sl JOIN accounts a ON a.id=sl.account_id WHERE a.modem_id=m.id AND sl.sent_at > now()-INTERVAL '24h') AS total_24h,
    now() AS computed_at
FROM modems m
UNION ALL
SELECT 'group'::text, g.id::bigint, g.name,
    0,
    (SELECT COUNT(*) FROM send_log sl WHERE sl.group_id=g.id AND sl.sent_at > now()-INTERVAL '24h' AND sl.status='failed'),
    (SELECT COUNT(*) FROM send_log sl WHERE sl.group_id=g.id AND sl.sent_at > now()-INTERVAL '24h'),
    now()
FROM groups g WHERE COALESCE(g.status, 'active') = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_anomaly_signals ON mv_anomaly_signals (scope, scope_id);
