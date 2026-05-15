-- Grava ponto no histórico quando o preço atual do catálogo muda (ou no primeiro insert).
CREATE OR REPLACE FUNCTION trg_catalog_price_snapshot() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO price_history (catalog_id, price, seen_at) VALUES (NEW.id, NEW.price_current, now());
    ELSIF TG_OP = 'UPDATE' AND NEW.price_current IS DISTINCT FROM OLD.price_current THEN
        INSERT INTO price_history (catalog_id, price, seen_at) VALUES (NEW.id, NEW.price_current, now());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_price_snapshot ON catalog;
CREATE TRIGGER catalog_price_snapshot
    AFTER INSERT OR UPDATE OF price_current ON catalog
    FOR EACH ROW EXECUTE FUNCTION trg_catalog_price_snapshot();

-- Linha inicial por produto já existente (um ponto; próximas mudanças vêm do trigger).
INSERT INTO price_history (catalog_id, price, seen_at)
SELECT c.id, c.price_current, COALESCE(c.updated_at, c.created_at)
FROM catalog c
WHERE NOT EXISTS (SELECT 1 FROM price_history ph WHERE ph.catalog_id = c.id);
