-- Cap anti-viralização — protege learned_weights e bandit_arms contra clicks
-- excedentes que vêm de viralização externa (link compartilhado fora do grupo).
--
-- Política: clicks_effective = LEAST(clicks_raw, k * member_count)
--   k = click_cap_per_member (default 3.0)
--
-- Excedente entra como métrica observacional (virality_ratio, view group_virality)
-- mas não influencia o learning.

INSERT INTO tunable_parameters (scope_type, scope_id, param_name, current_value, default_value, min_value, max_value) VALUES
    ('global', NULL, 'click_cap_per_member', 3.0, 3.0, 0.5, 20.0)
ON CONFLICT DO NOTHING;
