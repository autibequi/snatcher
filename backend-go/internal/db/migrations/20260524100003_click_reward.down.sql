DELETE FROM tunable_parameters WHERE param_name IN (
    'click_reward_weight',
    'learned_half_life_days'
);
