DELETE FROM tunable_parameters WHERE param_name IN (
    'score_weight_quality',
    'score_weight_affinity',
    'score_weight_channel',
    'score_weight_ctr',
    'score_weight_epc',
    'score_weight_freshness',
    'score_weight_saturation',
    'use_scoring_v2'
);
