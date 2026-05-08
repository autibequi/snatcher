-- migrate:up

-- BRAND WORD_BOUNDARY PATTERNS (~80 patterns)
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'samsung', 1.0, 'seed' FROM taxonomy WHERE slug='samsung' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'apple', 1.0, 'seed' FROM taxonomy WHERE slug='apple' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'xiaomi', 1.0, 'seed' FROM taxonomy WHERE slug='xiaomi' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'lg', 1.0, 'seed' FROM taxonomy WHERE slug='lg' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'sony', 1.0, 'seed' FROM taxonomy WHERE slug='sony' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'philips', 1.0, 'seed' FROM taxonomy WHERE slug='philips' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'motorola', 1.0, 'seed' FROM taxonomy WHERE slug='motorola' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'lenovo', 1.0, 'seed' FROM taxonomy WHERE slug='lenovo' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'dell', 1.0, 'seed' FROM taxonomy WHERE slug='dell' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'hp', 1.0, 'seed' FROM taxonomy WHERE slug='hp' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'asus', 1.0, 'seed' FROM taxonomy WHERE slug='asus' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'acer', 1.0, 'seed' FROM taxonomy WHERE slug='acer' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'msi', 1.0, 'seed' FROM taxonomy WHERE slug='msi' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'logitech', 1.0, 'seed' FROM taxonomy WHERE slug='logitech' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'intel', 1.0, 'seed' FROM taxonomy WHERE slug='intel' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'amd', 1.0, 'seed' FROM taxonomy WHERE slug='amd' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'nvidia', 1.0, 'seed' FROM taxonomy WHERE slug='nvidia' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'jbl', 1.0, 'seed' FROM taxonomy WHERE slug='jbl' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'edifier', 1.0, 'seed' FROM taxonomy WHERE slug='edifier' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'kingston', 1.0, 'seed' FROM taxonomy WHERE slug='kingston' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'razer', 1.0, 'seed' FROM taxonomy WHERE slug='razer' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'brastemp', 1.0, 'seed' FROM taxonomy WHERE slug='brastemp' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'consul', 1.0, 'seed' FROM taxonomy WHERE slug='consul' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'electrolux', 1.0, 'seed' FROM taxonomy WHERE slug='electrolux' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'mondial', 1.0, 'seed' FROM taxonomy WHERE slug='mondial' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'oster', 1.0, 'seed' FROM taxonomy WHERE slug='oster' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'britania', 1.0, 'seed' FROM taxonomy WHERE slug='britania' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'cadence', 1.0, 'seed' FROM taxonomy WHERE slug='cadence' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'arno', 1.0, 'seed' FROM taxonomy WHERE slug='arno' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'philco', 1.0, 'seed' FROM taxonomy WHERE slug='philco' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'tramontina', 1.0, 'seed' FROM taxonomy WHERE slug='tramontina' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'karcher', 1.0, 'seed' FROM taxonomy WHERE slug='karcher' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'bosch', 1.0, 'seed' FROM taxonomy WHERE slug='bosch' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'makita', 1.0, 'seed' FROM taxonomy WHERE slug='makita' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'dewalt', 1.0, 'seed' FROM taxonomy WHERE slug='dewalt' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'stanley', 1.0, 'seed' FROM taxonomy WHERE slug='stanley' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'vonder', 1.0, 'seed' FROM taxonomy WHERE slug='vonder' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'mor', 1.0, 'seed' FROM taxonomy WHERE slug='mor' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'nike', 1.0, 'seed' FROM taxonomy WHERE slug='nike' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'adidas', 1.0, 'seed' FROM taxonomy WHERE slug='adidas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'puma', 1.0, 'seed' FROM taxonomy WHERE slug='puma' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'asics', 1.0, 'seed' FROM taxonomy WHERE slug='asics' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'mizuno', 1.0, 'seed' FROM taxonomy WHERE slug='mizuno' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'olympikus', 1.0, 'seed' FROM taxonomy WHERE slug='olympikus' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'fila', 1.0, 'seed' FROM taxonomy WHERE slug='fila' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'reebok', 1.0, 'seed' FROM taxonomy WHERE slug='reebok' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'mormaii', 1.0, 'seed' FROM taxonomy WHERE slug='mormaii' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'oakley', 1.0, 'seed' FROM taxonomy WHERE slug='oakley' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'havaianas', 1.0, 'seed' FROM taxonomy WHERE slug='havaianas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'ipanema', 1.0, 'seed' FROM taxonomy WHERE slug='ipanema' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'melissa', 1.0, 'seed' FROM taxonomy WHERE slug='melissa' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'crocs', 1.0, 'seed' FROM taxonomy WHERE slug='crocs' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'polo', 1.0, 'seed' FROM taxonomy WHERE slug='polo' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'lacoste', 1.0, 'seed' FROM taxonomy WHERE slug='lacoste' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'calvin-klein', 1.0, 'seed' FROM taxonomy WHERE slug='calvin-klein' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'tommy-hilfiger', 1.0, 'seed' FROM taxonomy WHERE slug='tommy-hilfiger' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'levis', 1.0, 'seed' FROM taxonomy WHERE slug='levis' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'hering', 1.0, 'seed' FROM taxonomy WHERE slug='hering' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'boticario', 1.0, 'seed' FROM taxonomy WHERE slug='boticario' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'natura', 1.0, 'seed' FROM taxonomy WHERE slug='natura' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'eudora', 1.0, 'seed' FROM taxonomy WHERE slug='eudora' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'mac', 1.0, 'seed' FROM taxonomy WHERE slug='mac' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'maybelline', 1.0, 'seed' FROM taxonomy WHERE slug='maybelline' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'loreal', 1.0, 'seed' FROM taxonomy WHERE slug='loreal' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'nivea', 1.0, 'seed' FROM taxonomy WHERE slug='nivea' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'dove', 1.0, 'seed' FROM taxonomy WHERE slug='dove' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'pirelli', 1.0, 'seed' FROM taxonomy WHERE slug='pirelli' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'michelin', 1.0, 'seed' FROM taxonomy WHERE slug='michelin' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'goodyear', 1.0, 'seed' FROM taxonomy WHERE slug='goodyear' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'bridgestone', 1.0, 'seed' FROM taxonomy WHERE slug='bridgestone' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'ngk', 1.0, 'seed' FROM taxonomy WHERE slug='ngk' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'playstation', 1.0, 'seed' FROM taxonomy WHERE slug='playstation' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'xbox', 1.0, 'seed' FROM taxonomy WHERE slug='xbox' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'nintendo', 1.0, 'seed' FROM taxonomy WHERE slug='nintendo' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'hyperx', 1.0, 'seed' FROM taxonomy WHERE slug='hyperx' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'black-decker', 1.0, 'seed' FROM taxonomy WHERE slug='black-decker' ON CONFLICT DO NOTHING;

-- BRAND REGEX PATTERNS WITH ALIASES (~80 patterns)
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(samsung|galaxy|note\s*\d+)\b', 1.0, 'seed' FROM taxonomy WHERE slug='samsung' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(apple|iphone|ipad|macbook|airpods|airtag|imac)\b', 1.0, 'seed' FROM taxonomy WHERE slug='apple' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(xiaomi|redmi|poco|mi\s+band|mi\s+max)\b', 1.0, 'seed' FROM taxonomy WHERE slug='xiaomi' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(lg|life''?s\s*good)\b', 1.0, 'seed' FROM taxonomy WHERE slug='lg' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(sony|bravia|wh-?\d+)\b', 1.0, 'seed' FROM taxonomy WHERE slug='sony' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(motorola|moto\s*[gez]\s*\d*)\b', 1.0, 'seed' FROM taxonomy WHERE slug='motorola' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(lenovo|ideapad|thinkpad|legion|yoga)\b', 1.0, 'seed' FROM taxonomy WHERE slug='lenovo' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(dell|inspiron|vostro|alienware|xps|latitude)\b', 1.0, 'seed' FROM taxonomy WHERE slug='dell' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(hp|hewlett[\s-]?packard|pavilion|envy|elitebook)\b', 1.0, 'seed' FROM taxonomy WHERE slug='hp' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(asus|rog|tuf|zenbook|vivobook|zenfone)\b', 1.0, 'seed' FROM taxonomy WHERE slug='asus' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(acer|aspire|nitro|predator|swift)\b', 1.0, 'seed' FROM taxonomy WHERE slug='acer' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(msi|katana|stealth|raider)\b', 1.0, 'seed' FROM taxonomy WHERE slug='msi' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(jbl|charge\s*\d+|flip\s*\d+|go\s*\d+|xtreme)\b', 1.0, 'seed' FROM taxonomy WHERE slug='jbl' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(razer|deathadder|basilisk|blackwidow|huntsman)\b', 1.0, 'seed' FROM taxonomy WHERE slug='razer' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(brastemp|frost\s*free)\b', 1.0, 'seed' FROM taxonomy WHERE slug='brastemp' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(bosch|gbm|gsr|gws)\b', 1.0, 'seed' FROM taxonomy WHERE slug='bosch' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(makita|hp\s*\d+|dhp\s*\d+)\b', 1.0, 'seed' FROM taxonomy WHERE slug='makita' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(dewalt|dcd\s*\d+)\b', 1.0, 'seed' FROM taxonomy WHERE slug='dewalt' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(black\s*\+?\s*decker|black\s+decker|b\+d)\b', 1.0, 'seed' FROM taxonomy WHERE slug='black-decker' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(nike|air\s*max|jordan|swoosh|dunk)\b', 1.0, 'seed' FROM taxonomy WHERE slug='nike' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(adidas|three\s*stripes|originals|stan\s*smith|superstar)\b', 1.0, 'seed' FROM taxonomy WHERE slug='adidas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(asics|gel-?\w+)\b', 1.0, 'seed' FROM taxonomy WHERE slug='asics' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(playstation|ps[2345]|dualshock|dualsense|sony\s+ps)\b', 1.0, 'seed' FROM taxonomy WHERE slug='playstation' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(xbox|series\s*[xs]|xbox\s*one|microsoft\s+xbox)\b', 1.0, 'seed' FROM taxonomy WHERE slug='xbox' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(nintendo|switch|joy[\s-]?con|wii)\b', 1.0, 'seed' FROM taxonomy WHERE slug='nintendo' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(hyperx|cloud\s*ii|alloy)\b', 1.0, 'seed' FROM taxonomy WHERE slug='hyperx' ON CONFLICT DO NOTHING;

-- BRAND EXCLUDE_REGEX PATTERNS (~25 patterns)
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'exclude_regex', '\b(panela|frigideira)\s+acer\b', 1.0, 'seed' FROM taxonomy WHERE slug='acer' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'exclude_regex', '\bmor(er|reu|rendo|rido|te)\b', 1.0, 'seed' FROM taxonomy WHERE slug='mor' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'exclude_regex', '\bmor(an|ena|eno)\b', 1.0, 'seed' FROM taxonomy WHERE slug='mor' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'exclude_regex', '\b(suco|maçã|fruta)\s+(de\s+)?apple\b', 1.0, 'seed' FROM taxonomy WHERE slug='apple' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'exclude_regex', '\bapple\s+(juice|fruit)\b', 1.0, 'seed' FROM taxonomy WHERE slug='apple' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'exclude_regex', '\b(panela\s+dell|cidade\s+de\s+dell)\b', 1.0, 'seed' FROM taxonomy WHERE slug='dell' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'exclude_regex', '\b(polo\s+aquático|water\s*polo|polo\s+norte|polo\s+sul)\b', 1.0, 'seed' FROM taxonomy WHERE slug='polo' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'exclude_regex', '\b(hp\s+\d+\s*km)\b', 1.0, 'seed' FROM taxonomy WHERE slug='hp' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'exclude_regex', '\b(rua\s+bosch|escola\s+bosch)\b', 1.0, 'seed' FROM taxonomy WHERE slug='bosch' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'exclude_regex', '\b(sony\s*&\s*children|sony\s*e\s*children)\b', 1.0, 'seed' FROM taxonomy WHERE slug='sony' ON CONFLICT DO NOTHING;

-- SUBCATEGORIES PATTERNS (~160 patterns from top subcats)
-- Smartphones
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'celular', 1.0, 'seed' FROM taxonomy WHERE slug='smartphones' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'smartphone', 1.0, 'seed' FROM taxonomy WHERE slug='smartphones' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'phone', 1.0, 'seed' FROM taxonomy WHERE slug='smartphones' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'mobile', 1.0, 'seed' FROM taxonomy WHERE slug='smartphones' ON CONFLICT DO NOTHING;

-- Tablets
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'tablet', 1.0, 'seed' FROM taxonomy WHERE slug='tablets' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'ipad', 1.0, 'seed' FROM taxonomy WHERE slug='tablets' ON CONFLICT DO NOTHING;

-- TVs
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'smart tv', 1.0, 'seed' FROM taxonomy WHERE slug='tvs' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'televisão', 1.0, 'seed' FROM taxonomy WHERE slug='tvs' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'televisao', 1.0, 'seed' FROM taxonomy WHERE slug='tvs' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'tv led', 1.0, 'seed' FROM taxonomy WHERE slug='tvs' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'tv 4k', 1.0, 'seed' FROM taxonomy WHERE slug='tvs' ON CONFLICT DO NOTHING;

-- Headphones
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'headphone', 1.0, 'seed' FROM taxonomy WHERE slug='headphones' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'fone', 1.0, 'seed' FROM taxonomy WHERE slug='headphones' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'earbuds', 1.0, 'seed' FROM taxonomy WHERE slug='headphones' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'fone bluetooth', 1.0, 'seed' FROM taxonomy WHERE slug='headphones' ON CONFLICT DO NOTHING;

-- Caixas de Som
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'caixa de som', 1.0, 'seed' FROM taxonomy WHERE slug='caixas-som' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'speaker', 1.0, 'seed' FROM taxonomy WHERE slug='caixas-som' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'soundbar', 1.0, 'seed' FROM taxonomy WHERE slug='caixas-som' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'caixa bluetooth', 1.0, 'seed' FROM taxonomy WHERE slug='caixas-som' ON CONFLICT DO NOTHING;

-- Câmeras
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'câmera', 1.0, 'seed' FROM taxonomy WHERE slug='cameras' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'camera', 1.0, 'seed' FROM taxonomy WHERE slug='cameras' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'dslr', 1.0, 'seed' FROM taxonomy WHERE slug='cameras' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'mirrorless', 1.0, 'seed' FROM taxonomy WHERE slug='cameras' ON CONFLICT DO NOTHING;

-- Wearables
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'smartwatch', 1.0, 'seed' FROM taxonomy WHERE slug='wearables' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'relógio inteligente', 1.0, 'seed' FROM taxonomy WHERE slug='wearables' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'pulseira fitness', 1.0, 'seed' FROM taxonomy WHERE slug='wearables' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'mi band', 1.0, 'seed' FROM taxonomy WHERE slug='wearables' ON CONFLICT DO NOTHING;

-- Notebooks
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'notebook', 1.0, 'seed' FROM taxonomy WHERE slug='notebooks' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'laptop', 1.0, 'seed' FROM taxonomy WHERE slug='notebooks' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'ultrabook', 1.0, 'seed' FROM taxonomy WHERE slug='notebooks' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'macbook', 1.0, 'seed' FROM taxonomy WHERE slug='notebooks' ON CONFLICT DO NOTHING;

-- Monitores
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'monitor', 1.0, 'seed' FROM taxonomy WHERE slug='monitores' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'display', 1.0, 'seed' FROM taxonomy WHERE slug='monitores' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'tela computador', 1.0, 'seed' FROM taxonomy WHERE slug='monitores' ON CONFLICT DO NOTHING;

-- Mouses
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'mouse', 1.0, 'seed' FROM taxonomy WHERE slug='mouses' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'mouse gamer', 1.0, 'seed' FROM taxonomy WHERE slug='mouses' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'mouse sem fio', 1.0, 'seed' FROM taxonomy WHERE slug='mouses' ON CONFLICT DO NOTHING;

-- Teclados
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'teclado', 1.0, 'seed' FROM taxonomy WHERE slug='teclados' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'keyboard', 1.0, 'seed' FROM taxonomy WHERE slug='teclados' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'teclado mecânico', 1.0, 'seed' FROM taxonomy WHERE slug='teclados' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'teclado gamer', 1.0, 'seed' FROM taxonomy WHERE slug='teclados' ON CONFLICT DO NOTHING;

-- SSDs
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'ssd', 1.0, 'seed' FROM taxonomy WHERE slug='ssds' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'solid state', 1.0, 'seed' FROM taxonomy WHERE slug='ssds' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'm.2', 1.0, 'seed' FROM taxonomy WHERE slug='ssds' ON CONFLICT DO NOTHING;

-- HDs
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'hd externo', 1.0, 'seed' FROM taxonomy WHERE slug='hds' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'hard disk', 1.0, 'seed' FROM taxonomy WHERE slug='hds' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'hdd', 1.0, 'seed' FROM taxonomy WHERE slug='hds' ON CONFLICT DO NOTHING;

-- Roteadores
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'roteador', 1.0, 'seed' FROM taxonomy WHERE slug='roteadores' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'wifi 6', 1.0, 'seed' FROM taxonomy WHERE slug='roteadores' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'mesh', 1.0, 'seed' FROM taxonomy WHERE slug='roteadores' ON CONFLICT DO NOTHING;

-- Geladeiras
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'geladeira', 1.0, 'seed' FROM taxonomy WHERE slug='geladeiras' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'refrigerador', 1.0, 'seed' FROM taxonomy WHERE slug='geladeiras' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'frost free', 1.0, 'seed' FROM taxonomy WHERE slug='geladeiras' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'side by side', 1.0, 'seed' FROM taxonomy WHERE slug='geladeiras' ON CONFLICT DO NOTHING;

-- Fogões
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'fogão', 1.0, 'seed' FROM taxonomy WHERE slug='fogoes' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'cooktop', 1.0, 'seed' FROM taxonomy WHERE slug='fogoes' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'fogão de mesa', 1.0, 'seed' FROM taxonomy WHERE slug='fogoes' ON CONFLICT DO NOTHING;

-- Lavadoras
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'lavadora', 1.0, 'seed' FROM taxonomy WHERE slug='lavadoras' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'máquina de lavar', 1.0, 'seed' FROM taxonomy WHERE slug='lavadoras' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'lava e seca', 1.0, 'seed' FROM taxonomy WHERE slug='lavadoras' ON CONFLICT DO NOTHING;

-- Microondas
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'microondas', 1.0, 'seed' FROM taxonomy WHERE slug='microondas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'forno microondas', 1.0, 'seed' FROM taxonomy WHERE slug='microondas' ON CONFLICT DO NOTHING;

-- Aspiradores
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'aspirador', 1.0, 'seed' FROM taxonomy WHERE slug='aspiradores' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'robô aspirador', 1.0, 'seed' FROM taxonomy WHERE slug='aspiradores' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'roomba', 1.0, 'seed' FROM taxonomy WHERE slug='aspiradores' ON CONFLICT DO NOTHING;

-- Liquidificadores
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'liquidificador', 1.0, 'seed' FROM taxonomy WHERE slug='liquidificadores' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'mixer', 1.0, 'seed' FROM taxonomy WHERE slug='liquidificadores' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'blender', 1.0, 'seed' FROM taxonomy WHERE slug='liquidificadores' ON CONFLICT DO NOTHING;

-- Cafeteiras
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'cafeteira', 1.0, 'seed' FROM taxonomy WHERE slug='cafeteiras' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'café espresso', 1.0, 'seed' FROM taxonomy WHERE slug='cafeteiras' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'nespresso', 1.0, 'seed' FROM taxonomy WHERE slug='cafeteiras' ON CONFLICT DO NOTHING;

-- Air Fryers
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'air fryer', 1.0, 'seed' FROM taxonomy WHERE slug='air-fryers' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'fritadeira sem óleo', 1.0, 'seed' FROM taxonomy WHERE slug='air-fryers' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'airfryer', 1.0, 'seed' FROM taxonomy WHERE slug='air-fryers' ON CONFLICT DO NOTHING;

-- Calçados Masculinos
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'sapato masculino', 1.0, 'seed' FROM taxonomy WHERE slug='calcados-masculinos' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'tenis masculino', 1.0, 'seed' FROM taxonomy WHERE slug='calcados-masculinos' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'sapatênis', 1.0, 'seed' FROM taxonomy WHERE slug='calcados-masculinos' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'mocassim', 1.0, 'seed' FROM taxonomy WHERE slug='calcados-masculinos' ON CONFLICT DO NOTHING;

-- Calçados Femininos
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'sapato feminino', 1.0, 'seed' FROM taxonomy WHERE slug='calcados-femininos' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'sandália', 1.0, 'seed' FROM taxonomy WHERE slug='calcados-femininos' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'salto alto', 1.0, 'seed' FROM taxonomy WHERE slug='calcados-femininos' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'rasteirinha', 1.0, 'seed' FROM taxonomy WHERE slug='calcados-femininos' ON CONFLICT DO NOTHING;

-- Roupas Masculinas
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'camisa masculina', 1.0, 'seed' FROM taxonomy WHERE slug='roupas-masculinas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'camiseta masculina', 1.0, 'seed' FROM taxonomy WHERE slug='roupas-masculinas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'bermuda', 1.0, 'seed' FROM taxonomy WHERE slug='roupas-masculinas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'calça masculina', 1.0, 'seed' FROM taxonomy WHERE slug='roupas-masculinas' ON CONFLICT DO NOTHING;

-- Roupas Femininas
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'vestido', 1.0, 'seed' FROM taxonomy WHERE slug='roupas-femininas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'blusa feminina', 1.0, 'seed' FROM taxonomy WHERE slug='roupas-femininas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'saia', 1.0, 'seed' FROM taxonomy WHERE slug='roupas-femininas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'calça feminina', 1.0, 'seed' FROM taxonomy WHERE slug='roupas-femininas' ON CONFLICT DO NOTHING;

-- Bolsas
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'bolsa', 1.0, 'seed' FROM taxonomy WHERE slug='bolsas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'mochila', 1.0, 'seed' FROM taxonomy WHERE slug='bolsas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'carteira', 1.0, 'seed' FROM taxonomy WHERE slug='bolsas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'pochete', 1.0, 'seed' FROM taxonomy WHERE slug='bolsas' ON CONFLICT DO NOTHING;

-- Relógios
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'relógio', 1.0, 'seed' FROM taxonomy WHERE slug='relogios' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'cronógrafo', 1.0, 'seed' FROM taxonomy WHERE slug='relogios' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'relógio masculino', 1.0, 'seed' FROM taxonomy WHERE slug='relogios' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'relógio feminino', 1.0, 'seed' FROM taxonomy WHERE slug='relogios' ON CONFLICT DO NOTHING;

-- Cama Banho
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'lençol', 1.0, 'seed' FROM taxonomy WHERE slug='cama-mesa-banho' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'colcha', 1.0, 'seed' FROM taxonomy WHERE slug='cama-mesa-banho' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'edredom', 1.0, 'seed' FROM taxonomy WHERE slug='cama-mesa-banho' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'toalha', 1.0, 'seed' FROM taxonomy WHERE slug='cama-mesa-banho' ON CONFLICT DO NOTHING;

-- Móveis
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'sofá', 1.0, 'seed' FROM taxonomy WHERE slug='moveis' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'mesa', 1.0, 'seed' FROM taxonomy WHERE slug='moveis' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'cadeira', 1.0, 'seed' FROM taxonomy WHERE slug='moveis' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'estante', 1.0, 'seed' FROM taxonomy WHERE slug='moveis' ON CONFLICT DO NOTHING;

-- Panelas
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'panela', 1.0, 'seed' FROM taxonomy WHERE slug='panelas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'frigideira', 1.0, 'seed' FROM taxonomy WHERE slug='panelas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'caçarola', 1.0, 'seed' FROM taxonomy WHERE slug='panelas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'wok', 1.0, 'seed' FROM taxonomy WHERE slug='panelas' ON CONFLICT DO NOTHING;

-- Maquiagem
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'batom', 1.0, 'seed' FROM taxonomy WHERE slug='maquiagem' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'rímel', 1.0, 'seed' FROM taxonomy WHERE slug='maquiagem' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'base', 1.0, 'seed' FROM taxonomy WHERE slug='maquiagem' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'paleta sombra', 1.0, 'seed' FROM taxonomy WHERE slug='maquiagem' ON CONFLICT DO NOTHING;

-- Perfumes
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'perfume', 1.0, 'seed' FROM taxonomy WHERE slug='perfumes' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'colônia', 1.0, 'seed' FROM taxonomy WHERE slug='perfumes' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'eau de toilette', 1.0, 'seed' FROM taxonomy WHERE slug='perfumes' ON CONFLICT DO NOTHING;

-- Cabelo
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'shampoo', 1.0, 'seed' FROM taxonomy WHERE slug='cabelo' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'condicionador', 1.0, 'seed' FROM taxonomy WHERE slug='cabelo' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'máscara capilar', 1.0, 'seed' FROM taxonomy WHERE slug='cabelo' ON CONFLICT DO NOTHING;

-- Fitness
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'halter', 1.0, 'seed' FROM taxonomy WHERE slug='fitness' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'caneleira', 1.0, 'seed' FROM taxonomy WHERE slug='fitness' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'colchonete', 1.0, 'seed' FROM taxonomy WHERE slug='fitness' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'esteira', 1.0, 'seed' FROM taxonomy WHERE slug='fitness' ON CONFLICT DO NOTHING;

-- Bicicletas
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'bicicleta', 1.0, 'seed' FROM taxonomy WHERE slug='bicicletas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'bike', 1.0, 'seed' FROM taxonomy WHERE slug='bicicletas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'mountain bike', 1.0, 'seed' FROM taxonomy WHERE slug='bicicletas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'speed', 1.0, 'seed' FROM taxonomy WHERE slug='bicicletas' ON CONFLICT DO NOTHING;

-- Ferramentas Elétricas
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'furadeira', 1.0, 'seed' FROM taxonomy WHERE slug='ferramentas-eletricas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'parafusadeira', 1.0, 'seed' FROM taxonomy WHERE slug='ferramentas-eletricas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'esmerilhadeira', 1.0, 'seed' FROM taxonomy WHERE slug='ferramentas-eletricas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'serra circular', 1.0, 'seed' FROM taxonomy WHERE slug='ferramentas-eletricas' ON CONFLICT DO NOTHING;

-- Ferramentas Manuais
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'chave de fenda', 1.0, 'seed' FROM taxonomy WHERE slug='ferramentas-manuais' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'martelo', 1.0, 'seed' FROM taxonomy WHERE slug='ferramentas-manuais' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'alicate', 1.0, 'seed' FROM taxonomy WHERE slug='ferramentas-manuais' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'jogo de chaves', 1.0, 'seed' FROM taxonomy WHERE slug='ferramentas-manuais' ON CONFLICT DO NOTHING;

-- Tintas
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'tinta látex', 1.0, 'seed' FROM taxonomy WHERE slug='tintas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'esmalte sintético', 1.0, 'seed' FROM taxonomy WHERE slug='tintas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'tinta acrílica', 1.0, 'seed' FROM taxonomy WHERE slug='tintas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'verniz', 1.0, 'seed' FROM taxonomy WHERE slug='tintas' ON CONFLICT DO NOTHING;

-- VOLTAGES (3 patterns)
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(110\s*v|110\s*volts|127\s*v|127v)\b', 1.0, 'seed' FROM taxonomy WHERE slug='110v' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(220\s*v|220\s*volts)\b', 1.0, 'seed' FROM taxonomy WHERE slug='220v' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(bivolt|bi[\s-]?volt|110\/220)\b', 1.0, 'seed' FROM taxonomy WHERE slug='bivolt' ON CONFLICT DO NOTHING;

-- COLORS — WORD BOUNDARY (~25 patterns)
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'preto', 1.0, 'seed' FROM taxonomy WHERE slug='preto' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'preta', 1.0, 'seed' FROM taxonomy WHERE slug='preto' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'branco', 1.0, 'seed' FROM taxonomy WHERE slug='branco' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'branca', 1.0, 'seed' FROM taxonomy WHERE slug='branco' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'azul', 1.0, 'seed' FROM taxonomy WHERE slug='azul' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'azul marinho', 1.0, 'seed' FROM taxonomy WHERE slug='azul' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'azul royal', 1.0, 'seed' FROM taxonomy WHERE slug='azul' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'vermelho', 1.0, 'seed' FROM taxonomy WHERE slug='vermelho' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'vermelha', 1.0, 'seed' FROM taxonomy WHERE slug='vermelho' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'verde', 1.0, 'seed' FROM taxonomy WHERE slug='verde' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'verde militar', 1.0, 'seed' FROM taxonomy WHERE slug='verde' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'verde água', 1.0, 'seed' FROM taxonomy WHERE slug='verde' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'amarelo', 1.0, 'seed' FROM taxonomy WHERE slug='amarelo' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'rosa', 1.0, 'seed' FROM taxonomy WHERE slug='rosa' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'cinza', 1.0, 'seed' FROM taxonomy WHERE slug='cinza' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'grafite', 1.0, 'seed' FROM taxonomy WHERE slug='cinza' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'bege', 1.0, 'seed' FROM taxonomy WHERE slug='bege' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'creme', 1.0, 'seed' FROM taxonomy WHERE slug='bege' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'marrom', 1.0, 'seed' FROM taxonomy WHERE slug='marrom' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'castanho', 1.0, 'seed' FROM taxonomy WHERE slug='marrom' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'dourado', 1.0, 'seed' FROM taxonomy WHERE slug='dourado' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'prateado', 1.0, 'seed' FROM taxonomy WHERE slug='prateado' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'prata', 1.0, 'seed' FROM taxonomy WHERE slug='prateado' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'roxo', 1.0, 'seed' FROM taxonomy WHERE slug='roxo' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'laranja', 1.0, 'seed' FROM taxonomy WHERE slug='laranja' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'vinho', 1.0, 'seed' FROM taxonomy WHERE slug='vinho' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'salmão', 1.0, 'seed' FROM taxonomy WHERE slug='salmao' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'nude', 1.0, 'seed' FROM taxonomy WHERE slug='nude' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'turquesa', 1.0, 'seed' FROM taxonomy WHERE slug='turquesa' ON CONFLICT DO NOTHING;

-- SIZES CLOTHING — WORD BOUNDARY (~15 patterns)
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho\s+pp|tam\.?\s*pp|size\s+pp|pp\s*\(\d+\))\b', 1.0, 'seed' FROM taxonomy WHERE slug='pp' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho\s+p|tam\.?\s*p|size\s+p|p\s*\(\d+\))\b', 1.0, 'seed' FROM taxonomy WHERE slug='p' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho\s+m|tam\.?\s*m|size\s+m|m\s*\(\d+\))\b', 1.0, 'seed' FROM taxonomy WHERE slug='m' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho\s+g|tam\.?\s*g|size\s+g|g\s*\(\d+\))\b', 1.0, 'seed' FROM taxonomy WHERE slug='g' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho\s+gg|tam\.?\s*gg|size\s+gg|gg\s*\(\d+\))\b', 1.0, 'seed' FROM taxonomy WHERE slug='gg' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', '36', 1.0, 'seed' FROM taxonomy WHERE slug='36' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', '38', 1.0, 'seed' FROM taxonomy WHERE slug='38' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', '40', 1.0, 'seed' FROM taxonomy WHERE slug='40' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', '42', 1.0, 'seed' FROM taxonomy WHERE slug='42' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', '44', 1.0, 'seed' FROM taxonomy WHERE slug='44' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', '46', 1.0, 'seed' FROM taxonomy WHERE slug='46' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', '48', 1.0, 'seed' FROM taxonomy WHERE slug='48' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', '50', 1.0, 'seed' FROM taxonomy WHERE slug='50' ON CONFLICT DO NOTHING;

-- SIZES FOOTWEAR (~14 patterns)
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho|tam\.?|nº|num\.?)\s*33\b', 1.0, 'seed' FROM taxonomy WHERE slug='33' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho|tam\.?|nº|num\.?)\s*34\b', 1.0, 'seed' FROM taxonomy WHERE slug='34' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho|tam\.?|nº|num\.?)\s*35\b', 1.0, 'seed' FROM taxonomy WHERE slug='35' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho|tam\.?|nº|num\.?)\s*36\b', 1.0, 'seed' FROM taxonomy WHERE slug='36-foot' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho|tam\.?|nº|num\.?)\s*37\b', 1.0, 'seed' FROM taxonomy WHERE slug='37' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho|tam\.?|nº|num\.?)\s*38\b', 1.0, 'seed' FROM taxonomy WHERE slug='38-foot' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho|tam\.?|nº|num\.?)\s*39\b', 1.0, 'seed' FROM taxonomy WHERE slug='39' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho|tam\.?|nº|num\.?)\s*40\b', 1.0, 'seed' FROM taxonomy WHERE slug='40-foot' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho|tam\.?|nº|num\.?)\s*41\b', 1.0, 'seed' FROM taxonomy WHERE slug='41' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho|tam\.?|nº|num\.?)\s*42\b', 1.0, 'seed' FROM taxonomy WHERE slug='42-foot' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho|tam\.?|nº|num\.?)\s*43\b', 1.0, 'seed' FROM taxonomy WHERE slug='43' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b(tamanho|tam\.?|nº|num\.?)\s*44\b', 1.0, 'seed' FROM taxonomy WHERE slug='44-foot' ON CONFLICT DO NOTHING;

-- CAPACITIES — STORAGE (~20 patterns)
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b16\s*gb\b', 1.0, 'seed' FROM taxonomy WHERE slug='16gb' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b32\s*gb\b', 1.0, 'seed' FROM taxonomy WHERE slug='32gb' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b64\s*gb\b', 1.0, 'seed' FROM taxonomy WHERE slug='64gb' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b128\s*gb\b', 1.0, 'seed' FROM taxonomy WHERE slug='128gb' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b256\s*gb\b', 1.0, 'seed' FROM taxonomy WHERE slug='256gb' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b512\s*gb\b', 1.0, 'seed' FROM taxonomy WHERE slug='512gb' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b1\s*tb\b', 1.0, 'seed' FROM taxonomy WHERE slug='1tb' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b2\s*tb\b', 1.0, 'seed' FROM taxonomy WHERE slug='2tb' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b4\s*tb\b', 1.0, 'seed' FROM taxonomy WHERE slug='4tb' ON CONFLICT DO NOTHING;

-- CAPACITIES — VOLUME (~10 patterns)
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b1\s*(l|litros?)\b', 1.0, 'seed' FROM taxonomy WHERE slug='1l' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b2\s*(l|litros?)\b', 1.0, 'seed' FROM taxonomy WHERE slug='2l' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b5\s*(l|litros?)\b', 1.0, 'seed' FROM taxonomy WHERE slug='5l' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b10\s*(l|litros?)\b', 1.0, 'seed' FROM taxonomy WHERE slug='10l' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b20\s*(l|litros?)\b', 1.0, 'seed' FROM taxonomy WHERE slug='20l' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b50\s*(l|litros?)\b', 1.0, 'seed' FROM taxonomy WHERE slug='50l' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b100\s*(l|litros?)\b', 1.0, 'seed' FROM taxonomy WHERE slug='100l' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b200\s*(l|litros?)\b', 1.0, 'seed' FROM taxonomy WHERE slug='200l' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b300\s*(l|litros?)\b', 1.0, 'seed' FROM taxonomy WHERE slug='300l' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'regex', '\b500\s*(l|litros?)\b', 1.0, 'seed' FROM taxonomy WHERE slug='500l' ON CONFLICT DO NOTHING;

-- ROOT CATEGORIES — GENERAL PATTERNS (~30 patterns)
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'eletrônico', 1.0, 'seed' FROM taxonomy WHERE slug='eletronicos' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'eletronica', 1.0, 'seed' FROM taxonomy WHERE slug='eletronicos' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'eletrodoméstico', 1.0, 'seed' FROM taxonomy WHERE slug='eletrodomesticos' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'eletrodomestico', 1.0, 'seed' FROM taxonomy WHERE slug='eletrodomesticos' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'computador', 1.0, 'seed' FROM taxonomy WHERE slug='informatica' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'fashion', 1.0, 'seed' FROM taxonomy WHERE slug='moda' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'roupas', 1.0, 'seed' FROM taxonomy WHERE slug='moda' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'vestuário', 1.0, 'seed' FROM taxonomy WHERE slug='moda' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'casa', 1.0, 'seed' FROM taxonomy WHERE slug='casa-decoracao' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'decoração', 1.0, 'seed' FROM taxonomy WHERE slug='casa-decoracao' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'home', 1.0, 'seed' FROM taxonomy WHERE slug='casa-decoracao' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'beleza', 1.0, 'seed' FROM taxonomy WHERE slug='beleza-saude' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'cosméticos', 1.0, 'seed' FROM taxonomy WHERE slug='beleza-saude' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'saúde', 1.0, 'seed' FROM taxonomy WHERE slug='beleza-saude' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'esporte', 1.0, 'seed' FROM taxonomy WHERE slug='esportes' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'sport', 1.0, 'seed' FROM taxonomy WHERE slug='esportes' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'fitness', 1.0, 'seed' FROM taxonomy WHERE slug='esportes' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'brinquedo', 1.0, 'seed' FROM taxonomy WHERE slug='brinquedos' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'toy', 1.0, 'seed' FROM taxonomy WHERE slug='brinquedos' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'contains_keyword', 'pet shop', 1.0, 'seed' FROM taxonomy WHERE slug='pet' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'animais', 1.0, 'seed' FROM taxonomy WHERE slug='pet' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'alimentos', 1.0, 'seed' FROM taxonomy WHERE slug='mercado' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'supermercado', 1.0, 'seed' FROM taxonomy WHERE slug='mercado' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'construção', 1.0, 'seed' FROM taxonomy WHERE slug='construcao-ferramentas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'ferramenta', 1.0, 'seed' FROM taxonomy WHERE slug='construcao-ferramentas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'reforma', 1.0, 'seed' FROM taxonomy WHERE slug='construcao-ferramentas' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'automotivo', 1.0, 'seed' FROM taxonomy WHERE slug='automotivo' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'carro', 1.0, 'seed' FROM taxonomy WHERE slug='automotivo' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'veículo', 1.0, 'seed' FROM taxonomy WHERE slug='automotivo' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'bebê', 1.0, 'seed' FROM taxonomy WHERE slug='bebes' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'newborn', 1.0, 'seed' FROM taxonomy WHERE slug='bebes' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'livro', 1.0, 'seed' FROM taxonomy WHERE slug='livros' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'jogo', 1.0, 'seed' FROM taxonomy WHERE slug='games' ON CONFLICT DO NOTHING;
INSERT INTO taxonomy_pattern (taxonomy_id, kind, value, weight, source) SELECT id, 'word_boundary', 'gaming', 1.0, 'seed' FROM taxonomy WHERE slug='games' ON CONFLICT DO NOTHING;

-- migrate:down
DELETE FROM taxonomy_pattern WHERE source='seed' AND created_at >= (
  SELECT MIN(created_at) FROM (
    SELECT created_at FROM taxonomy_pattern WHERE source='seed' ORDER BY created_at DESC LIMIT 1500
  ) t
);
