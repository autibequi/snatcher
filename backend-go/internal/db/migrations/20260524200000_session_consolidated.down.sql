-- Rollback da migration consolidada.
DROP TRIGGER IF EXISTS catalog_auto_classify ON catalog;
DROP FUNCTION IF EXISTS trg_catalog_auto_classify();
DROP FUNCTION IF EXISTS classify_catalog_category(TEXT, TEXT);
DROP VIEW IF EXISTS group_virality;
DROP TABLE IF EXISTS algo_status;
DROP TABLE IF EXISTS bandit_arms_channel;
DROP TABLE IF EXISTS learned_weights_channel;
DROP FUNCTION IF EXISTS ensure_group_shortlink(BIGINT, BIGINT);
DROP TABLE IF EXISTS group_shortlinks;
DROP TABLE IF EXISTS bandit_arms;
ALTER TABLE group_sent_history DROP COLUMN IF EXISTS price_at_send;
ALTER TABLE channels_v2 DROP COLUMN IF EXISTS price_min;
ALTER TABLE channels_v2 DROP COLUMN IF EXISTS price_max;
ALTER TABLE channels_v2 DROP COLUMN IF EXISTS min_discount_pct;
DELETE FROM tunable_parameters WHERE param_name IN (
    'score_weight_quality','score_weight_affinity','score_weight_channel',
    'score_weight_ctr','score_weight_epc','score_weight_freshness',
    'score_weight_saturation','use_epsilon_explore','use_thompson_sampling',
    'repromo_drop_threshold','repromo_cooldown_hours',
    'antirepeat_window_days','antirepeat_window_days_price_up',
    'click_reward_weight','learned_half_life_days','click_cap_per_member'
);
