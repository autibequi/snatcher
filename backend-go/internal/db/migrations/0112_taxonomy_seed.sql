-- migrate:up

-- Expandir taxonomy_type_check para suportar 'voltage' e 'capacity' (mig 0099 só tem até quantity)
ALTER TABLE taxonomy DROP CONSTRAINT IF EXISTS taxonomy_type_check;
ALTER TABLE taxonomy ADD CONSTRAINT taxonomy_type_check
    CHECK (type IN ('category', 'brand', 'weight', 'flavor', 'color', 'size', 'quantity', 'voltage', 'capacity'));

-- TABLE 1: taxonomy_pattern (pattern matching library)
CREATE TABLE IF NOT EXISTS taxonomy_pattern (
  id BIGSERIAL PRIMARY KEY,
  taxonomy_id BIGINT NOT NULL REFERENCES taxonomy(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('exact_keyword','contains_keyword','word_boundary','regex','exclude_regex','exclude_keyword')),
  value TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  locale TEXT DEFAULT 'pt-BR',
  source TEXT DEFAULT 'seed',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_taxonomy_pattern_tx ON taxonomy_pattern(taxonomy_id, kind, active);
CREATE INDEX IF NOT EXISTS ix_taxonomy_pattern_kind_active ON taxonomy_pattern(kind, active);

-- TABLE 2: catalogproduct_taxonomy (linking products to taxonomy with roles)
CREATE TABLE IF NOT EXISTS catalogproduct_taxonomy (
  product_id BIGINT NOT NULL REFERENCES catalogproduct(id) ON DELETE CASCADE,
  taxonomy_id BIGINT NOT NULL REFERENCES taxonomy(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('primary_category','subcategory','brand','attribute_color','attribute_size','attribute_voltage','attribute_capacity','attribute_other')),
  confidence REAL NOT NULL DEFAULT 1.0,
  source TEXT DEFAULT 'pipeline',
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (product_id, taxonomy_id, role)
);
CREATE INDEX IF NOT EXISTS ix_cpt_role_tx ON catalogproduct_taxonomy(role, taxonomy_id);
CREATE INDEX IF NOT EXISTS ix_cpt_product ON catalogproduct_taxonomy(product_id);

-- TABLE 3: Add attributes column to catalogproduct
ALTER TABLE catalogproduct ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS ix_cp_attrs_gin ON catalogproduct USING GIN (attributes);

-- SEED DATA
-- ==========

-- Root categories (15 total)
INSERT INTO taxonomy (type, name, slug, keywords, active, status, source) VALUES
  ('category', 'Eletrônicos', 'eletronicos', ARRAY['eletrônico', 'eletronica', 'elektronico'], true, 'approved', 'seed'),
  ('category', 'Eletrodomésticos', 'eletrodomesticos', ARRAY['eletrodoméstico', 'eletrodomestico', 'appliances'], true, 'approved', 'seed'),
  ('category', 'Informática', 'informatica', ARRAY['informática', 'informatica', 'computador', 'it'], true, 'approved', 'seed'),
  ('category', 'Moda', 'moda', ARRAY['roupa', 'vestuário', 'vestuario', 'clothing'], true, 'approved', 'seed'),
  ('category', 'Casa & Decoração', 'casa-decoracao', ARRAY['casa', 'decoração', 'decoracao', 'home'], true, 'approved', 'seed'),
  ('category', 'Beleza & Saúde', 'beleza-saude', ARRAY['beleza', 'saúde', 'saude', 'beauty', 'health'], true, 'approved', 'seed'),
  ('category', 'Esportes', 'esportes', ARRAY['esporte', 'sport', 'fitness'], true, 'approved', 'seed'),
  ('category', 'Brinquedos', 'brinquedos', ARRAY['brinquedo', 'toy', 'toys'], true, 'approved', 'seed'),
  ('category', 'Pet', 'pet', ARRAY['pet', 'animal', 'animais'], true, 'approved', 'seed'),
  ('category', 'Mercado', 'mercado', ARRAY['alimentos', 'alimento', 'grocery', 'food'], true, 'approved', 'seed'),
  ('category', 'Construção & Ferramentas', 'construcao-ferramentas', ARRAY['construção', 'construcao', 'ferramentas', 'ferramenta', 'tools'], true, 'approved', 'seed'),
  ('category', 'Automotivo', 'automotivo', ARRAY['automotivo', 'carro', 'auto', 'automotive', 'car'], true, 'approved', 'seed'),
  ('category', 'Bebês', 'bebes', ARRAY['bebê', 'bebe', 'baby'], true, 'approved', 'seed'),
  ('category', 'Livros', 'livros', ARRAY['livro', 'books', 'book'], true, 'approved', 'seed'),
  ('category', 'Games', 'games', ARRAY['game', 'games', 'jogo', 'jogar'], true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Subcategories (~80)
-- Eletrônicos
INSERT INTO taxonomy (type, name, slug, keywords, parent_id, active, status, source) VALUES
  ('category', 'Smartphones', 'smartphones', ARRAY['smartphone', 'celular', 'phone', 'mobile'], (SELECT id FROM taxonomy WHERE slug='eletronicos'), true, 'approved', 'seed'),
  ('category', 'Tablets', 'tablets', ARRAY['tablet', 'ipad'], (SELECT id FROM taxonomy WHERE slug='eletronicos'), true, 'approved', 'seed'),
  ('category', 'TVs', 'tvs', ARRAY['tv', 'televisão', 'televisao', 'television'], (SELECT id FROM taxonomy WHERE slug='eletronicos'), true, 'approved', 'seed'),
  ('category', 'Headphones', 'headphones', ARRAY['headphone', 'fone', 'headset', 'earbuds'], (SELECT id FROM taxonomy WHERE slug='eletronicos'), true, 'approved', 'seed'),
  ('category', 'Caixas de Som', 'caixas-som', ARRAY['caixa de som', 'caixa som', 'speaker', 'sound box'], (SELECT id FROM taxonomy WHERE slug='eletronicos'), true, 'approved', 'seed'),
  ('category', 'Câmeras', 'cameras', ARRAY['câmera', 'camera', 'fotográfica', 'fotografica'], (SELECT id FROM taxonomy WHERE slug='eletronicos'), true, 'approved', 'seed'),
  ('category', 'Wearables', 'wearables', ARRAY['wearable', 'smartwatch', 'watch', 'relógio inteligente'], (SELECT id FROM taxonomy WHERE slug='eletronicos'), true, 'approved', 'seed'),
  ('category', 'Drones', 'drones', ARRAY['drone', 'dji'], (SELECT id FROM taxonomy WHERE slug='eletronicos'), true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Informática
INSERT INTO taxonomy (type, name, slug, keywords, parent_id, active, status, source) VALUES
  ('category', 'Notebooks', 'notebooks', ARRAY['notebook', 'laptop', 'computador portátil'], (SELECT id FROM taxonomy WHERE slug='informatica'), true, 'approved', 'seed'),
  ('category', 'Desktops', 'desktops', ARRAY['desktop', 'pc', 'computador'], (SELECT id FROM taxonomy WHERE slug='informatica'), true, 'approved', 'seed'),
  ('category', 'Monitores', 'monitores', ARRAY['monitor', 'tela'], (SELECT id FROM taxonomy WHERE slug='informatica'), true, 'approved', 'seed'),
  ('category', 'Mouses', 'mouses', ARRAY['mouse', 'rato'], (SELECT id FROM taxonomy WHERE slug='informatica'), true, 'approved', 'seed'),
  ('category', 'Teclados', 'teclados', ARRAY['teclado', 'keyboard'], (SELECT id FROM taxonomy WHERE slug='informatica'), true, 'approved', 'seed'),
  ('category', 'Headsets', 'headsets', ARRAY['headset', 'fone gamer'], (SELECT id FROM taxonomy WHERE slug='informatica'), true, 'approved', 'seed'),
  ('category', 'SSDs', 'ssds', ARRAY['ssd', 'solid state', 'disco ssd'], (SELECT id FROM taxonomy WHERE slug='informatica'), true, 'approved', 'seed'),
  ('category', 'HDs', 'hds', ARRAY['hd', 'disco rígido', 'hard drive'], (SELECT id FROM taxonomy WHERE slug='informatica'), true, 'approved', 'seed'),
  ('category', 'Roteadores', 'roteadores', ARRAY['roteador', 'router', 'modem'], (SELECT id FROM taxonomy WHERE slug='informatica'), true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Eletrodomésticos
INSERT INTO taxonomy (type, name, slug, keywords, parent_id, active, status, source) VALUES
  ('category', 'Geladeiras', 'geladeiras', ARRAY['geladeira', 'refrigerador', 'fridge'], (SELECT id FROM taxonomy WHERE slug='eletrodomesticos'), true, 'approved', 'seed'),
  ('category', 'Fogões', 'fogoes', ARRAY['fogão', 'fogao', 'stove'], (SELECT id FROM taxonomy WHERE slug='eletrodomesticos'), true, 'approved', 'seed'),
  ('category', 'Lavadoras', 'lavadoras', ARRAY['lavadora', 'washing machine', 'máquina de lavar'], (SELECT id FROM taxonomy WHERE slug='eletrodomesticos'), true, 'approved', 'seed'),
  ('category', 'Microondas', 'microondas', ARRAY['microondas', 'microwave'], (SELECT id FROM taxonomy WHERE slug='eletrodomesticos'), true, 'approved', 'seed'),
  ('category', 'Aspiradores', 'aspiradores', ARRAY['aspirador', 'aspirador de pó', 'vacuum'], (SELECT id FROM taxonomy WHERE slug='eletrodomesticos'), true, 'approved', 'seed'),
  ('category', 'Liquidificadores', 'liquidificadores', ARRAY['liquidificador', 'blender'], (SELECT id FROM taxonomy WHERE slug='eletrodomesticos'), true, 'approved', 'seed'),
  ('category', 'Cafeteiras', 'cafeteiras', ARRAY['cafeteira', 'coffee maker'], (SELECT id FROM taxonomy WHERE slug='eletrodomesticos'), true, 'approved', 'seed'),
  ('category', 'Air Fryers', 'air-fryers', ARRAY['air fryer', 'fritadeira', 'freidora'], (SELECT id FROM taxonomy WHERE slug='eletrodomesticos'), true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Moda
INSERT INTO taxonomy (type, name, slug, keywords, parent_id, active, status, source) VALUES
  ('category', 'Calçados Masculinos', 'calcados-masculinos', ARRAY['sapato masculino', 'tenis masculino', 'men shoes'], (SELECT id FROM taxonomy WHERE slug='moda'), true, 'approved', 'seed'),
  ('category', 'Calçados Femininos', 'calcados-femininos', ARRAY['sapato feminino', 'tenis feminino', 'women shoes'], (SELECT id FROM taxonomy WHERE slug='moda'), true, 'approved', 'seed'),
  ('category', 'Roupas Masculinas', 'roupas-masculinas', ARRAY['camisa masculina', 'calça masculina', 'men clothes'], (SELECT id FROM taxonomy WHERE slug='moda'), true, 'approved', 'seed'),
  ('category', 'Roupas Femininas', 'roupas-femininas', ARRAY['blusa feminina', 'saia feminina', 'women clothes'], (SELECT id FROM taxonomy WHERE slug='moda'), true, 'approved', 'seed'),
  ('category', 'Bolsas', 'bolsas', ARRAY['bolsa', 'mochila', 'bag', 'handbag'], (SELECT id FROM taxonomy WHERE slug='moda'), true, 'approved', 'seed'),
  ('category', 'Relógios', 'relogios', ARRAY['relógio', 'relogio', 'watch'], (SELECT id FROM taxonomy WHERE slug='moda'), true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Casa & Decoração
INSERT INTO taxonomy (type, name, slug, keywords, parent_id, active, status, source) VALUES
  ('category', 'Cama Mesa Banho', 'cama-mesa-banho', ARRAY['cama', 'colcha', 'lençol', 'toalha'], (SELECT id FROM taxonomy WHERE slug='casa-decoracao'), true, 'approved', 'seed'),
  ('category', 'Móveis', 'moveis', ARRAY['móvel', 'movel', 'furniture'], (SELECT id FROM taxonomy WHERE slug='casa-decoracao'), true, 'approved', 'seed'),
  ('category', 'Panelas', 'panelas', ARRAY['panela', 'frigideira', 'jogo de panelas'], (SELECT id FROM taxonomy WHERE slug='casa-decoracao'), true, 'approved', 'seed'),
  ('category', 'Decoração', 'decoracao', ARRAY['decoração', 'decoracao', 'decoration'], (SELECT id FROM taxonomy WHERE slug='casa-decoracao'), true, 'approved', 'seed'),
  ('category', 'Iluminação', 'iluminacao', ARRAY['iluminação', 'iluminacao', 'lâmpada', 'lampada'], (SELECT id FROM taxonomy WHERE slug='casa-decoracao'), true, 'approved', 'seed'),
  ('category', 'Jardim', 'jardim', ARRAY['jardim', 'planta', 'garden'], (SELECT id FROM taxonomy WHERE slug='casa-decoracao'), true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Beleza & Saúde
INSERT INTO taxonomy (type, name, slug, keywords, parent_id, active, status, source) VALUES
  ('category', 'Maquiagem', 'maquiagem', ARRAY['maquiagem', 'makeup', 'cosmético'], (SELECT id FROM taxonomy WHERE slug='beleza-saude'), true, 'approved', 'seed'),
  ('category', 'Perfumes', 'perfumes', ARRAY['perfume', 'fragrância', 'cologne'], (SELECT id FROM taxonomy WHERE slug='beleza-saude'), true, 'approved', 'seed'),
  ('category', 'Skincare', 'skincare', ARRAY['skincare', 'cuidado com a pele', 'creme facial'], (SELECT id FROM taxonomy WHERE slug='beleza-saude'), true, 'approved', 'seed'),
  ('category', 'Cabelo', 'cabelo', ARRAY['cabelo', 'shampoo', 'condicionador'], (SELECT id FROM taxonomy WHERE slug='beleza-saude'), true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Esportes
INSERT INTO taxonomy (type, name, slug, keywords, parent_id, active, status, source) VALUES
  ('category', 'Fitness', 'fitness', ARRAY['fitness', 'musculação', 'academia'], (SELECT id FROM taxonomy WHERE slug='esportes'), true, 'approved', 'seed'),
  ('category', 'Bicicletas', 'bicicletas', ARRAY['bicicleta', 'bike', 'bicycle'], (SELECT id FROM taxonomy WHERE slug='esportes'), true, 'approved', 'seed'),
  ('category', 'Camping', 'camping', ARRAY['camping', 'barraca', 'mochila'], (SELECT id FROM taxonomy WHERE slug='esportes'), true, 'approved', 'seed'),
  ('category', 'Futebol', 'futebol', ARRAY['futebol', 'soccer', 'bola'], (SELECT id FROM taxonomy WHERE slug='esportes'), true, 'approved', 'seed'),
  ('category', 'Corrida', 'corrida', ARRAY['corrida', 'running', 'tênis de corrida'], (SELECT id FROM taxonomy WHERE slug='esportes'), true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Construção & Ferramentas
INSERT INTO taxonomy (type, name, slug, keywords, parent_id, active, status, source) VALUES
  ('category', 'Ferramentas Elétricas', 'ferramentas-eletricas', ARRAY['ferramenta elétrica', 'furadeira', 'parafusadeira'], (SELECT id FROM taxonomy WHERE slug='construcao-ferramentas'), true, 'approved', 'seed'),
  ('category', 'Ferramentas Manuais', 'ferramentas-manuais', ARRAY['ferramenta manual', 'martelo', 'chave inglesa'], (SELECT id FROM taxonomy WHERE slug='construcao-ferramentas'), true, 'approved', 'seed'),
  ('category', 'Tintas', 'tintas', ARRAY['tinta', 'paint'], (SELECT id FROM taxonomy WHERE slug='construcao-ferramentas'), true, 'approved', 'seed'),
  ('category', 'Hidráulica', 'hidraulica', ARRAY['hidráulica', 'hidraulica', 'encanamento'], (SELECT id FROM taxonomy WHERE slug='construcao-ferramentas'), true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Automotivo
INSERT INTO taxonomy (type, name, slug, keywords, parent_id, active, status, source) VALUES
  ('category', 'Pneus', 'pneus', ARRAY['pneu', 'pneumatico', 'tire'], (SELECT id FROM taxonomy WHERE slug='automotivo'), true, 'approved', 'seed'),
  ('category', 'Som Automotivo', 'som-automotivo', ARRAY['som automotivo', 'auto falante', 'speaker carro'], (SELECT id FROM taxonomy WHERE slug='automotivo'), true, 'approved', 'seed'),
  ('category', 'Acessórios Automotivos', 'acessorios-automotivos', ARRAY['acessório automotivo', 'acessorio', 'car accessories'], (SELECT id FROM taxonomy WHERE slug='automotivo'), true, 'approved', 'seed'),
  ('category', 'Óleos', 'oleos', ARRAY['óleo', 'oleo', 'lubrificante', 'oil'], (SELECT id FROM taxonomy WHERE slug='automotivo'), true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Games
INSERT INTO taxonomy (type, name, slug, keywords, parent_id, active, status, source) VALUES
  ('category', 'Consoles', 'consoles', ARRAY['console', 'playstation', 'xbox', 'nintendo'], (SELECT id FROM taxonomy WHERE slug='games'), true, 'approved', 'seed'),
  ('category', 'Jogos', 'jogos', ARRAY['jogo', 'game', 'videogame'], (SELECT id FROM taxonomy WHERE slug='games'), true, 'approved', 'seed'),
  ('category', 'Acessórios Gamer', 'acessorios-gamer', ARRAY['acessório gamer', 'acessorio', 'gaming'], (SELECT id FROM taxonomy WHERE slug='games'), true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Bebês
INSERT INTO taxonomy (type, name, slug, keywords, parent_id, active, status, source) VALUES
  ('category', 'Carrinhos', 'carrinhos', ARRAY['carrinho', 'carrinho de bebê', 'stroller'], (SELECT id FROM taxonomy WHERE slug='bebes'), true, 'approved', 'seed'),
  ('category', 'Cadeirinhas', 'cadeirinhas', ARRAY['cadeirinha', 'assento infantil', 'car seat'], (SELECT id FROM taxonomy WHERE slug='bebes'), true, 'approved', 'seed'),
  ('category', 'Berços', 'bercos', ARRAY['berço', 'berco', 'crib'], (SELECT id FROM taxonomy WHERE slug='bebes'), true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Pet
INSERT INTO taxonomy (type, name, slug, keywords, parent_id, active, status, source) VALUES
  ('category', 'Ração', 'racao', ARRAY['ração', 'racao', 'pet food', 'comida'], (SELECT id FROM taxonomy WHERE slug='pet'), true, 'approved', 'seed'),
  ('category', 'Brinquedos Pet', 'brinquedos-pet', ARRAY['brinquedo pet', 'brinquedo animal', 'pet toy'], (SELECT id FROM taxonomy WHERE slug='pet'), true, 'approved', 'seed'),
  ('category', 'Casinhas', 'casinhas', ARRAY['casinha', 'cama pet', 'casa animal'], (SELECT id FROM taxonomy WHERE slug='pet'), true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Brands (~150)
INSERT INTO taxonomy (type, name, slug, keywords, active, status, source) VALUES
  ('brand', 'Samsung', 'samsung', ARRAY['samsung', 'galaxy'], true, 'approved', 'seed'),
  ('brand', 'Apple', 'apple', ARRAY['apple', 'iphone', 'ipad', 'macbook'], true, 'approved', 'seed'),
  ('brand', 'Xiaomi', 'xiaomi', ARRAY['xiaomi', 'redmi', 'poco'], true, 'approved', 'seed'),
  ('brand', 'LG', 'lg', ARRAY['lg', 'lge'], true, 'approved', 'seed'),
  ('brand', 'Sony', 'sony', ARRAY['sony', 'vaio'], true, 'approved', 'seed'),
  ('brand', 'Philips', 'philips', ARRAY['philips', 'phillips'], true, 'approved', 'seed'),
  ('brand', 'Motorola', 'motorola', ARRAY['motorola', 'moto'], true, 'approved', 'seed'),
  ('brand', 'Lenovo', 'lenovo', ARRAY['lenovo', 'thinkpad'], true, 'approved', 'seed'),
  ('brand', 'Dell', 'dell', ARRAY['dell', 'alienware'], true, 'approved', 'seed'),
  ('brand', 'HP', 'hp', ARRAY['hp', 'hewlett', 'hewlett-packard'], true, 'approved', 'seed'),
  ('brand', 'Asus', 'asus', ARRAY['asus', 'asustek'], true, 'approved', 'seed'),
  ('brand', 'Acer', 'acer', ARRAY['acer', 'aspire', 'nitro', 'predator'], true, 'approved', 'seed'),
  ('brand', 'MSI', 'msi', ARRAY['msi', 'micro-star'], true, 'approved', 'seed'),
  ('brand', 'Logitech', 'logitech', ARRAY['logitech', 'logi'], true, 'approved', 'seed'),
  ('brand', 'Intel', 'intel', ARRAY['intel', 'core i3', 'core i5', 'core i7', 'core i9'], true, 'approved', 'seed'),
  ('brand', 'AMD', 'amd', ARRAY['amd', 'ryzen', 'radeon'], true, 'approved', 'seed'),
  ('brand', 'JBL', 'jbl', ARRAY['jbl'], true, 'approved', 'seed'),
  ('brand', 'Edifier', 'edifier', ARRAY['edifier'], true, 'approved', 'seed'),
  ('brand', 'Kingston', 'kingston', ARRAY['kingston'], true, 'approved', 'seed'),
  ('brand', 'Razer', 'razer', ARRAY['razer'], true, 'approved', 'seed'),
  ('brand', 'Brastemp', 'brastemp', ARRAY['brastemp'], true, 'approved', 'seed'),
  ('brand', 'Consul', 'consul', ARRAY['consul'], true, 'approved', 'seed'),
  ('brand', 'Electrolux', 'electrolux', ARRAY['electrolux', 'electrolúx'], true, 'approved', 'seed'),
  ('brand', 'Mondial', 'mondial', ARRAY['mondial'], true, 'approved', 'seed'),
  ('brand', 'Oster', 'oster', ARRAY['oster'], true, 'approved', 'seed'),
  ('brand', 'Britania', 'britania', ARRAY['britania', 'britânia'], true, 'approved', 'seed'),
  ('brand', 'Cadence', 'cadence', ARRAY['cadence'], true, 'approved', 'seed'),
  ('brand', 'Arno', 'arno', ARRAY['arno'], true, 'approved', 'seed'),
  ('brand', 'Philco', 'philco', ARRAY['philco'], true, 'approved', 'seed'),
  ('brand', 'Tramontina', 'tramontina', ARRAY['tramontina'], true, 'approved', 'seed'),
  ('brand', 'Kärcher', 'karcher', ARRAY['kärcher', 'karcher'], true, 'approved', 'seed'),
  ('brand', 'Bosch', 'bosch', ARRAY['bosch'], true, 'approved', 'seed'),
  ('brand', 'Black+Decker', 'black-decker', ARRAY['black+decker', 'black decker'], true, 'approved', 'seed'),
  ('brand', 'Makita', 'makita', ARRAY['makita'], true, 'approved', 'seed'),
  ('brand', 'DeWalt', 'dewalt', ARRAY['dewalt', 'de walt'], true, 'approved', 'seed'),
  ('brand', 'Stanley', 'stanley', ARRAY['stanley'], true, 'approved', 'seed'),
  ('brand', 'Vonder', 'vonder', ARRAY['vonder'], true, 'approved', 'seed'),
  ('brand', 'Mor', 'mor', ARRAY['mor'], true, 'approved', 'seed'),
  ('brand', 'Nike', 'nike', ARRAY['nike'], true, 'approved', 'seed'),
  ('brand', 'Adidas', 'adidas', ARRAY['adidas'], true, 'approved', 'seed'),
  ('brand', 'Puma', 'puma', ARRAY['puma'], true, 'approved', 'seed'),
  ('brand', 'Asics', 'asics', ARRAY['asics'], true, 'approved', 'seed'),
  ('brand', 'Mizuno', 'mizuno', ARRAY['mizuno'], true, 'approved', 'seed'),
  ('brand', 'Olympikus', 'olympikus', ARRAY['olympikus'], true, 'approved', 'seed'),
  ('brand', 'Fila', 'fila', ARRAY['fila'], true, 'approved', 'seed'),
  ('brand', 'Reebok', 'reebok', ARRAY['reebok'], true, 'approved', 'seed'),
  ('brand', 'Mormaii', 'mormaii', ARRAY['mormaii'], true, 'approved', 'seed'),
  ('brand', 'Oakley', 'oakley', ARRAY['oakley'], true, 'approved', 'seed'),
  ('brand', 'Havaianas', 'havaianas', ARRAY['havaianas'], true, 'approved', 'seed'),
  ('brand', 'Ipanema', 'ipanema', ARRAY['ipanema'], true, 'approved', 'seed'),
  ('brand', 'Melissa', 'melissa', ARRAY['melissa'], true, 'approved', 'seed'),
  ('brand', 'Crocs', 'crocs', ARRAY['crocs'], true, 'approved', 'seed'),
  ('brand', 'Polo Ralph Lauren', 'polo', ARRAY['polo', 'ralph lauren'], true, 'approved', 'seed'),
  ('brand', 'Lacoste', 'lacoste', ARRAY['lacoste'], true, 'approved', 'seed'),
  ('brand', 'Calvin Klein', 'calvin-klein', ARRAY['calvin klein'], true, 'approved', 'seed'),
  ('brand', 'Tommy Hilfiger', 'tommy-hilfiger', ARRAY['tommy hilfiger', 'hilfiger'], true, 'approved', 'seed'),
  ('brand', 'Levi''s', 'levis', ARRAY['levis', 'levi''s'], true, 'approved', 'seed'),
  ('brand', 'Hering', 'hering', ARRAY['hering'], true, 'approved', 'seed'),
  ('brand', 'Boticário', 'boticario', ARRAY['boticário', 'boticario'], true, 'approved', 'seed'),
  ('brand', 'Natura', 'natura', ARRAY['natura'], true, 'approved', 'seed'),
  ('brand', 'Eudora', 'eudora', ARRAY['eudora'], true, 'approved', 'seed'),
  ('brand', 'MAC', 'mac', ARRAY['mac', 'mac cosmetics'], true, 'approved', 'seed'),
  ('brand', 'Maybelline', 'maybelline', ARRAY['maybelline'], true, 'approved', 'seed'),
  ('brand', 'L''Oréal', 'loreal', ARRAY['loreal', 'l''oréal'], true, 'approved', 'seed'),
  ('brand', 'Nivea', 'nivea', ARRAY['nivea'], true, 'approved', 'seed'),
  ('brand', 'Dove', 'dove', ARRAY['dove'], true, 'approved', 'seed'),
  ('brand', 'Pirelli', 'pirelli', ARRAY['pirelli'], true, 'approved', 'seed'),
  ('brand', 'Michelin', 'michelin', ARRAY['michelin'], true, 'approved', 'seed'),
  ('brand', 'Goodyear', 'goodyear', ARRAY['goodyear', 'good year'], true, 'approved', 'seed'),
  ('brand', 'Bridgestone', 'bridgestone', ARRAY['bridgestone'], true, 'approved', 'seed'),
  ('brand', 'NGK', 'ngk', ARRAY['ngk'], true, 'approved', 'seed'),
  ('brand', 'PlayStation', 'playstation', ARRAY['playstation', 'ps4', 'ps5'], true, 'approved', 'seed'),
  ('brand', 'Xbox', 'xbox', ARRAY['xbox', 'microsoft'], true, 'approved', 'seed'),
  ('brand', 'Nintendo', 'nintendo', ARRAY['nintendo', 'switch'], true, 'approved', 'seed'),
  ('brand', 'HyperX', 'hyperx', ARRAY['hyperx'], true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Attributes: Colors (~25)
INSERT INTO taxonomy (type, name, slug, keywords, active, status, source) VALUES
  ('color', 'Preto', 'preto', ARRAY['preto', 'black', 'negro'], true, 'approved', 'seed'),
  ('color', 'Branco', 'branco', ARRAY['branco', 'white'], true, 'approved', 'seed'),
  ('color', 'Azul', 'azul', ARRAY['azul', 'blue'], true, 'approved', 'seed'),
  ('color', 'Vermelho', 'vermelho', ARRAY['vermelho', 'red', 'rojo'], true, 'approved', 'seed'),
  ('color', 'Verde', 'verde', ARRAY['verde', 'green'], true, 'approved', 'seed'),
  ('color', 'Amarelo', 'amarelo', ARRAY['amarelo', 'yellow'], true, 'approved', 'seed'),
  ('color', 'Rosa', 'rosa', ARRAY['rosa', 'pink'], true, 'approved', 'seed'),
  ('color', 'Cinza', 'cinza', ARRAY['cinza', 'gray', 'grey'], true, 'approved', 'seed'),
  ('color', 'Bege', 'bege', ARRAY['bege', 'beige'], true, 'approved', 'seed'),
  ('color', 'Marrom', 'marrom', ARRAY['marrom', 'brown', 'café'], true, 'approved', 'seed'),
  ('color', 'Dourado', 'dourado', ARRAY['dourado', 'gold', 'golden'], true, 'approved', 'seed'),
  ('color', 'Prateado', 'prateado', ARRAY['prateado', 'silver', 'prata'], true, 'approved', 'seed'),
  ('color', 'Roxo', 'roxo', ARRAY['roxo', 'purple', 'violeta'], true, 'approved', 'seed'),
  ('color', 'Laranja', 'laranja', ARRAY['laranja', 'orange'], true, 'approved', 'seed'),
  ('color', 'Vinho', 'vinho', ARRAY['vinho', 'wine', 'burgundy'], true, 'approved', 'seed'),
  ('color', 'Salmão', 'salmao', ARRAY['salmão', 'salmao', 'salmon'], true, 'approved', 'seed'),
  ('color', 'Nude', 'nude', ARRAY['nude', 'bege claro'], true, 'approved', 'seed'),
  ('color', 'Turquesa', 'turquesa', ARRAY['turquesa', 'turquoise'], true, 'approved', 'seed'),
  ('color', 'Ciano', 'ciano', ARRAY['ciano', 'cyan'], true, 'approved', 'seed'),
  ('color', 'Grafite', 'grafite', ARRAY['grafite', 'charcoal'], true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Attributes: Sizes (~30)
INSERT INTO taxonomy (type, name, slug, keywords, active, status, source) VALUES
  ('size', 'PP', 'pp', ARRAY['pp', 'extra pequeno'], true, 'approved', 'seed'),
  ('size', 'P', 'p', ARRAY['p', 'pequeno'], true, 'approved', 'seed'),
  ('size', 'M', 'm', ARRAY['m', 'médio', 'medio'], true, 'approved', 'seed'),
  ('size', 'G', 'g', ARRAY['g', 'grande'], true, 'approved', 'seed'),
  ('size', 'GG', 'gg', ARRAY['gg', 'extra grande'], true, 'approved', 'seed'),
  ('size', 'XG', 'xg', ARRAY['xg', 'xl'], true, 'approved', 'seed'),
  ('size', 'XGG', 'xgg', ARRAY['xgg', 'xxl'], true, 'approved', 'seed'),
  ('size', '36', 'calcado-36', ARRAY['36'], true, 'approved', 'seed'),
  ('size', '37', 'calcado-37', ARRAY['37'], true, 'approved', 'seed'),
  ('size', '38', 'calcado-38', ARRAY['38'], true, 'approved', 'seed'),
  ('size', '39', 'calcado-39', ARRAY['39'], true, 'approved', 'seed'),
  ('size', '40', 'calcado-40', ARRAY['40'], true, 'approved', 'seed'),
  ('size', '41', 'calcado-41', ARRAY['41'], true, 'approved', 'seed'),
  ('size', '42', 'calcado-42', ARRAY['42'], true, 'approved', 'seed'),
  ('size', '43', 'calcado-43', ARRAY['43'], true, 'approved', 'seed'),
  ('size', '44', 'calcado-44', ARRAY['44'], true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Attributes: Voltage (3)
INSERT INTO taxonomy (type, name, slug, keywords, active, status, source) VALUES
  ('voltage', '110V', '110v', ARRAY['110v', '110 volts'], true, 'approved', 'seed'),
  ('voltage', '220V', '220v', ARRAY['220v', '220 volts'], true, 'approved', 'seed'),
  ('voltage', 'Bivolt', 'bivolt', ARRAY['bivolt', 'bivoltagem'], true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- Attributes: Capacity (~30)
INSERT INTO taxonomy (type, name, slug, keywords, active, status, source) VALUES
  ('capacity', '16GB', '16gb', ARRAY['16gb', '16 gb'], true, 'approved', 'seed'),
  ('capacity', '32GB', '32gb', ARRAY['32gb', '32 gb'], true, 'approved', 'seed'),
  ('capacity', '64GB', '64gb', ARRAY['64gb', '64 gb'], true, 'approved', 'seed'),
  ('capacity', '128GB', '128gb', ARRAY['128gb', '128 gb'], true, 'approved', 'seed'),
  ('capacity', '256GB', '256gb', ARRAY['256gb', '256 gb'], true, 'approved', 'seed'),
  ('capacity', '512GB', '512gb', ARRAY['512gb', '512 gb'], true, 'approved', 'seed'),
  ('capacity', '1TB', '1tb', ARRAY['1tb', '1 tb'], true, 'approved', 'seed'),
  ('capacity', '2TB', '2tb', ARRAY['2tb', '2 tb'], true, 'approved', 'seed'),
  ('capacity', '4TB', '4tb', ARRAY['4tb', '4 tb'], true, 'approved', 'seed'),
  ('capacity', '1L', '1l', ARRAY['1l', '1 litro'], true, 'approved', 'seed'),
  ('capacity', '2L', '2l', ARRAY['2l', '2 litros'], true, 'approved', 'seed'),
  ('capacity', '5L', '5l', ARRAY['5l', '5 litros'], true, 'approved', 'seed'),
  ('capacity', '10L', '10l', ARRAY['10l', '10 litros'], true, 'approved', 'seed'),
  ('capacity', '20L', '20l', ARRAY['20l', '20 litros'], true, 'approved', 'seed'),
  ('capacity', '50L', '50l', ARRAY['50l', '50 litros'], true, 'approved', 'seed'),
  ('capacity', '100L', '100l', ARRAY['100l', '100 litros'], true, 'approved', 'seed'),
  ('capacity', '200L', '200l', ARRAY['200l', '200 litros'], true, 'approved', 'seed'),
  ('capacity', '300L', '300l', ARRAY['300l', '300 litros'], true, 'approved', 'seed'),
  ('capacity', '400L', '400l', ARRAY['400l', '400 litros'], true, 'approved', 'seed'),
  ('capacity', '500L', '500l', ARRAY['500l', '500 litros'], true, 'approved', 'seed')
ON CONFLICT (type, slug) DO NOTHING;

-- PATTERNS (selected examples to keep seed manageable)
-- Brand patterns
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'word_boundary', 'samsung', 1.0, 'seed' FROM taxonomy WHERE slug='samsung' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'regex', 'samsung|galaxy', 0.95, 'seed' FROM taxonomy WHERE slug='samsung' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'word_boundary', 'apple', 1.0, 'seed' FROM taxonomy WHERE slug='apple' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'regex', 'apple|iphone|ipad|macbook|airpods', 0.9, 'seed' FROM taxonomy WHERE slug='apple' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'word_boundary', 'xiaomi', 1.0, 'seed' FROM taxonomy WHERE slug='xiaomi' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'regex', 'xiaomi|redmi|poco', 0.95, 'seed' FROM taxonomy WHERE slug='xiaomi' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'word_boundary', 'lg', 1.0, 'seed' FROM taxonomy WHERE slug='lg' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'word_boundary', 'sony', 1.0, 'seed' FROM taxonomy WHERE slug='sony' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'exclude_regex', '\bace?r\b', 1.0, 'seed' FROM taxonomy WHERE slug='acer' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'word_boundary', 'acer', 0.9, 'seed' FROM taxonomy WHERE slug='acer' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'regex', 'acer|aspire|nitro|predator', 0.85, 'seed' FROM taxonomy WHERE slug='acer' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'exclude_regex', '\bmor(er|reu)\b', 1.0, 'seed' FROM taxonomy WHERE slug='mor' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'word_boundary', 'mor', 0.8, 'seed' FROM taxonomy WHERE slug='mor' ON CONFLICT DO NOTHING;

-- Subcategory patterns
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'contains_keyword', 'smartphone', 0.8, 'seed' FROM taxonomy WHERE slug='smartphones' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'contains_keyword', 'celular', 0.8, 'seed' FROM taxonomy WHERE slug='smartphones' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'contains_keyword', 'notebook', 0.8, 'seed' FROM taxonomy WHERE slug='notebooks' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'contains_keyword', 'laptop', 0.8, 'seed' FROM taxonomy WHERE slug='notebooks' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'contains_keyword', 'monitor', 0.8, 'seed' FROM taxonomy WHERE slug='monitores' ON CONFLICT DO NOTHING;

-- Color patterns
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'word_boundary', 'preto', 1.0, 'seed' FROM taxonomy WHERE slug='preto' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'word_boundary', 'branco', 1.0, 'seed' FROM taxonomy WHERE slug='branco' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'word_boundary', 'azul', 1.0, 'seed' FROM taxonomy WHERE slug='azul' ON CONFLICT DO NOTHING;

-- Voltage patterns
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'regex', '\b(110\s*v|110\s*volts|127v)\b', 1.0, 'seed' FROM taxonomy WHERE slug='110v' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'regex', '\b(220\s*v|220\s*volts)\b', 1.0, 'seed' FROM taxonomy WHERE slug='220v' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'word_boundary', 'bivolt', 1.0, 'seed' FROM taxonomy WHERE slug='bivolt' ON CONFLICT DO NOTHING;

-- Capacity patterns (sample)
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'regex', '\b16\s*gb\b', 1.0, 'seed' FROM taxonomy WHERE slug='16gb' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'regex', '\b32\s*gb\b', 1.0, 'seed' FROM taxonomy WHERE slug='32gb' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'regex', '\b64\s*gb\b', 1.0, 'seed' FROM taxonomy WHERE slug='64gb' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'regex', '\b128\s*gb\b', 1.0, 'seed' FROM taxonomy WHERE slug='128gb' ON CONFLICT DO NOTHING;

INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source)
SELECT id, 'regex', '\b256\s*gb\b', 1.0, 'seed' FROM taxonomy WHERE slug='256gb' ON CONFLICT DO NOTHING;

-- migrate:down
DROP TABLE IF EXISTS catalogproduct_taxonomy;
DROP TABLE IF EXISTS taxonomy_pattern;
ALTER TABLE catalogproduct DROP COLUMN IF EXISTS attributes;
DELETE FROM taxonomy WHERE type IN ('voltage', 'capacity');
ALTER TABLE taxonomy DROP CONSTRAINT IF EXISTS taxonomy_type_check;
ALTER TABLE taxonomy ADD CONSTRAINT taxonomy_type_check
    CHECK (type IN ('category', 'brand', 'weight', 'flavor', 'color', 'size', 'quantity'));
