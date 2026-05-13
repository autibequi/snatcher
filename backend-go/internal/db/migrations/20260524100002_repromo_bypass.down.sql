ALTER TABLE group_sent_history DROP COLUMN IF EXISTS price_at_send;

DELETE FROM tunable_parameters WHERE param_name IN (
    'repromo_drop_threshold',
    'repromo_cooldown_hours',
    'antirepeat_window_days',
    'antirepeat_window_days_price_up'
);
