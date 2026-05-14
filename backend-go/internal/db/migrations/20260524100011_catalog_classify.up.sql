-- Auto-classificação de produtos no catálogo por keywords do título.
-- Prioridade: gaming > eletronico > casa > moda > geral.
-- Usa ILIKE para compatibilidade sem extensões extras.

CREATE OR REPLACE FUNCTION classify_catalog_category(p_title TEXT, p_source TEXT DEFAULT '')
RETURNS BIGINT AS $$
DECLARE
    v_slug TEXT;
    v_id   BIGINT;
BEGIN
    v_slug := CASE
        WHEN p_title ILIKE ANY(ARRAY[
                '%gamer%','%gaming%','%console%','%playstation%','%xbox%',
                '%nintendo%','%joystick%','%geforce%','%rtx%','%gtx%',
                '%corsair%','%razer%','%hyperx%','%steelseries%','%headset gamer%'
             ])
            THEN 'gaming'

        WHEN p_title ILIKE ANY(ARRAY[
                '%celular%','%smartphone%','%tablet%','%notebook%','%laptop%',
                '%monitor%','%teclado%','%mouse%','%headphone%','%fone de ouvido%',
                '%smartwatch%','%câmera%','%camera%','%impressora%','%processador%',
                '% ssd%','%pendrive%','%roteador%','%carregador%','%cabo usb%',
                '%samsung%','%motorola%','%xiaomi%','%apple%','%iphone%','%ipad%',
                '%lenovo%','%asus%','%dell%','% hp %','%positivo%','%multilaser%'
             ])
            THEN 'eletronico'

        WHEN p_title ILIKE ANY(ARRAY[
                '%sofá%','%sofa%','%poltrona%','%mesa%','%cama%','%travesseiro%',
                '%colchão%','%colchao%','%geladeira%','%fogão%','%fogao%',
                '%microondas%','%liquidificador%','%panela%','%frigideira%',
                '%ventilador%','%luminária%','%luminaria%','%toalha%',
                '%lençol%','%lencol%','%cortina%','%tapete%','%vassoura%',
                '%vassoura%','%cafeteira%','%torradeira%','%chaleira%'
             ])
            THEN 'casa'

        WHEN p_title ILIKE ANY(ARRAY[
                '%vestido%','%calça%','%calca%','%camiseta%','%camisa%',
                '%sapato%','%tênis%','%tenis%','%bota%','%sandália%','%sandalia%',
                '%bolsa%','%brinco%','%colar%','%anel%','%relógio%','%relogio%',
                '%perfume%','%maquiagem%','%pincel%','%batom%','%base%','% máscara%',
                '%shampoo%','%condicionador%','%creme%','%hidratante%'
             ])
            THEN 'moda'

        ELSE 'geral'
    END;

    SELECT id INTO v_id FROM categories WHERE slug = v_slug;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Classifica produtos existentes sem category_id.
UPDATE catalog
SET category_id = classify_catalog_category(title, source_id)
WHERE category_id IS NULL;

-- Trigger: classifica automaticamente novos produtos e updates de título.
CREATE OR REPLACE FUNCTION trg_catalog_auto_classify() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.category_id IS NULL THEN
        NEW.category_id := classify_catalog_category(NEW.title, NEW.source_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_auto_classify ON catalog;
CREATE TRIGGER catalog_auto_classify
    BEFORE INSERT OR UPDATE OF title, source_id ON catalog
    FOR EACH ROW EXECUTE FUNCTION trg_catalog_auto_classify();
