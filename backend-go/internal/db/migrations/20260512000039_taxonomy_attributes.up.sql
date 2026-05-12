-- Expande tipos de taxonomia para incluir atributos de produto (peso, sabor, cor, tamanho, quantidade)
ALTER TABLE taxonomy DROP CONSTRAINT IF EXISTS taxonomy_type_check;
ALTER TABLE taxonomy ADD CONSTRAINT taxonomy_type_check
    CHECK (type IN ('category', 'brand', 'weight', 'flavor', 'color', 'size', 'quantity'));

-- Seeds: pesos/tamanhos comuns em suplementos e geral
INSERT INTO taxonomy (type, name, slug, keywords, active, status, source) VALUES
    ('weight', '100g',   '100g',   ARRAY['100g', '100 g', '100 gramas'],   true, 'approved', 'manual'),
    ('weight', '200g',   '200g',   ARRAY['200g', '200 g', '200 gramas'],   true, 'approved', 'manual'),
    ('weight', '250g',   '250g',   ARRAY['250g', '250 g', '250 gramas'],   true, 'approved', 'manual'),
    ('weight', '300g',   '300g',   ARRAY['300g', '300 g', '300 gramas'],   true, 'approved', 'manual'),
    ('weight', '400g',   '400g',   ARRAY['400g', '400 g', '400 gramas'],   true, 'approved', 'manual'),
    ('weight', '450g',   '450g',   ARRAY['450g', '450 g'],                 true, 'approved', 'manual'),
    ('weight', '500g',   '500g',   ARRAY['500g', '500 g', '500 gramas'],   true, 'approved', 'manual'),
    ('weight', '600g',   '600g',   ARRAY['600g', '600 g'],                 true, 'approved', 'manual'),
    ('weight', '750g',   '750g',   ARRAY['750g', '750 g'],                 true, 'approved', 'manual'),
    ('weight', '900g',   '900g',   ARRAY['900g', '900 g', '900 gramas'],   true, 'approved', 'manual'),
    ('weight', '907g',   '907g',   ARRAY['907g', '2lb', '2 lb'],           true, 'approved', 'manual'),
    ('weight', '1kg',    '1kg',    ARRAY['1kg', '1 kg', '1000g', '1000 g'], true, 'approved', 'manual'),
    ('weight', '1.5kg',  '1-5kg',  ARRAY['1.5kg', '1,5kg', '1500g'],      true, 'approved', 'manual'),
    ('weight', '2kg',    '2kg',    ARRAY['2kg', '2 kg', '2000g'],          true, 'approved', 'manual'),
    ('weight', '2.27kg', '2-27kg', ARRAY['2.27kg', '5lb', '5 lb'],         true, 'approved', 'manual'),
    ('weight', '2.5kg',  '2-5kg',  ARRAY['2.5kg', '2,5kg', '2500g'],      true, 'approved', 'manual'),
    ('weight', '3kg',    '3kg',    ARRAY['3kg', '3 kg', '3000g'],          true, 'approved', 'manual'),
    ('weight', '4kg',    '4kg',    ARRAY['4kg', '4 kg'],                   true, 'approved', 'manual'),
    ('weight', '5kg',    '5kg',    ARRAY['5kg', '5 kg'],                   true, 'approved', 'manual'),

-- Seeds: sabores comuns em suplementos
    ('flavor', 'Baunilha',      'baunilha',      ARRAY['baunilha', 'vanilla', 'creme baunilha'],  true, 'approved', 'manual'),
    ('flavor', 'Chocolate',     'chocolate',     ARRAY['chocolate', 'cacau', 'dark chocolate'],   true, 'approved', 'manual'),
    ('flavor', 'Morango',       'morango',       ARRAY['morango', 'strawberry', 'red fruits'],    true, 'approved', 'manual'),
    ('flavor', 'Cookies',       'cookies',       ARRAY['cookies', 'cookies cream', 'cookies e cream'], true, 'approved', 'manual'),
    ('flavor', 'Natural',       'natural',       ARRAY['natural', 'sem sabor', 'unflavored'],     true, 'approved', 'manual'),
    ('flavor', 'Frutas Vermelhas', 'frutas-vermelhas', ARRAY['frutas vermelhas', 'red berry', 'berry'], true, 'approved', 'manual'),
    ('flavor', 'Caramelo',      'caramelo',      ARRAY['caramelo', 'salted caramel', 'caramel'], true, 'approved', 'manual'),
    ('flavor', 'Banana',        'banana',        ARRAY['banana', 'banana split'],                 true, 'approved', 'manual'),
    ('flavor', 'Beijinho',      'beijinho',      ARRAY['beijinho', 'coco'],                       true, 'approved', 'manual'),
    ('flavor', 'Mango',         'mango',         ARRAY['mango', 'manga'],                         true, 'approved', 'manual'),

-- Seeds: quantidades comuns (cápsulas, sachês, unidades)
    ('quantity', '30 caps',   '30-caps',   ARRAY['30 caps', '30caps', '30 capsulas', '30 comprimidos'], true, 'approved', 'manual'),
    ('quantity', '60 caps',   '60-caps',   ARRAY['60 caps', '60caps', '60 capsulas'],    true, 'approved', 'manual'),
    ('quantity', '90 caps',   '90-caps',   ARRAY['90 caps', '90caps', '90 capsulas'],    true, 'approved', 'manual'),
    ('quantity', '120 caps',  '120-caps',  ARRAY['120 caps', '120caps', '120 capsulas'], true, 'approved', 'manual'),
    ('quantity', '30 sachês', '30-saches', ARRAY['30 saches', '30 sachets', '30 doses'], true, 'approved', 'manual'),
    ('quantity', '60 sachês', '60-saches', ARRAY['60 saches', '60 sachets'],             true, 'approved', 'manual'),

-- Seeds: tamanhos de roupa/vestuário
    ('size', 'P',   'p',  ARRAY['tamanho p', 'pp', ' p ', 'size s', 'small'], true, 'approved', 'manual'),
    ('size', 'M',   'm',  ARRAY['tamanho m', ' m ', 'size m', 'medium'],      true, 'approved', 'manual'),
    ('size', 'G',   'g',  ARRAY['tamanho g', ' g ', 'size l', 'large'],       true, 'approved', 'manual'),
    ('size', 'GG',  'gg', ARRAY['tamanho gg', 'tamanho xl', 'size xl', 'extra large'], true, 'approved', 'manual')

ON CONFLICT (type, slug) DO NOTHING;
