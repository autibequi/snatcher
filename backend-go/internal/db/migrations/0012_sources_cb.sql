-- migrate:up
-- 0012_sources_cb.sql
-- Add cross-border marketplace sources: AliExpress, Shein, AWIN
-- These sources complement the Brazil-specific sources (Mercado Livre, Amazon BR) from 0011
-- AWIN is a multi-merchant affiliate network; each product includes source_subid for merchant identification

INSERT INTO sources (id, name, category, enabled) VALUES
    ('aliexpress', 'AliExpress',  'ecommerce', true),
    ('shein',      'Shein',       'ecommerce', true),
    ('awin',       'AWIN Network','ecommerce', true)
ON CONFLICT DO NOTHING;

-- migrate:down
-- noop
