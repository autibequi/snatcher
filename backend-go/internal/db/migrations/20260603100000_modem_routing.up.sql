CREATE TABLE modem_routing (
    modem_id            BIGINT REFERENCES modems(id) ON DELETE CASCADE,
    domain_id           BIGINT REFERENCES redirect_domains(id) ON DELETE CASCADE,
    affinity_score      NUMERIC(5,2) NOT NULL DEFAULT 1.0,
    seeded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at        TIMESTAMPTZ,
    PRIMARY KEY (modem_id, domain_id)
);
CREATE INDEX idx_modem_routing_modem ON modem_routing(modem_id, affinity_score DESC);
