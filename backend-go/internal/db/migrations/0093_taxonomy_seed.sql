-- migrate:up
-- Seed inicial de categorias de e-commerce brasileiro
INSERT INTO taxonomy (type, name, slug, keywords) VALUES
    -- Eletrônicos
    ('category', 'Smartphones', 'smartphones', ARRAY['smartphone','celular','iphone','galaxy','xiaomi','redmi','motorola','moto']),
    ('category', 'Notebooks', 'notebooks', ARRAY['notebook','laptop','macbook','ultrabook','chromebook']),
    ('category', 'Tablets', 'tablets', ARRAY['tablet','ipad','galaxy tab']),
    ('category', 'Smart TVs', 'smart-tvs', ARRAY['smart tv','tv','televisão','oled','qled','led']),
    ('category', 'Headphones e Fones', 'headphones', ARRAY['fone','headphone','headset','earbuds','airpods','jbl']),
    ('category', 'Smartwatches', 'smartwatches', ARRAY['smartwatch','relógio inteligente','apple watch','galaxy watch']),
    ('category', 'Câmeras', 'cameras', ARRAY['câmera','camera','dslr','mirrorless','gopro']),
    ('category', 'Consoles e Games', 'consoles-games', ARRAY['playstation','ps5','ps4','xbox','nintendo','switch','console','jogo']),
    ('category', 'Periféricos', 'perifericos', ARRAY['mouse','teclado','keyboard','headset','webcam','monitor']),
    ('category', 'Hardware PC', 'hardware-pc', ARRAY['placa de vídeo','gpu','rtx','rx','processador','cpu','ssd','memória ram','ram','hd']),
    -- Casa e cozinha
    ('category', 'Eletrodomésticos', 'eletrodomesticos', ARRAY['geladeira','fogão','micro-ondas','microondas','lava louças','lava-louças','máquina de lavar']),
    ('category', 'Eletroportáteis', 'eletroportateis', ARRAY['liquidificador','batedeira','air fryer','airfryer','cafeteira','panela elétrica']),
    ('category', 'Móveis', 'moveis', ARRAY['sofá','mesa','cadeira','armário','guarda-roupa','cama','colchão']),
    ('category', 'Decoração', 'decoracao', ARRAY['tapete','cortina','quadro','luminária','vaso']),
    ('category', 'Cama Mesa e Banho', 'cama-mesa-banho', ARRAY['lençol','toalha','edredom','colcha','jogo de cama']),
    -- Moda
    ('category', 'Roupas Masculinas', 'roupas-masculinas', ARRAY['camisa','camiseta','calça','bermuda','jaqueta masculino','blusa masculina']),
    ('category', 'Roupas Femininas', 'roupas-femininas', ARRAY['vestido','blusa feminina','calça feminina','saia','jaqueta feminina']),
    ('category', 'Calçados', 'calcados', ARRAY['tênis','sapato','sandália','chinelo','bota']),
    ('category', 'Bolsas e Mochilas', 'bolsas-mochilas', ARRAY['bolsa','mochila','carteira','pochete']),
    ('category', 'Relógios', 'relogios', ARRAY['relógio','watch']),
    -- Beleza
    ('category', 'Perfumes', 'perfumes', ARRAY['perfume','colônia','fragrância']),
    ('category', 'Cosméticos', 'cosmeticos', ARRAY['maquiagem','batom','base','rímel','sombra','blush']),
    ('category', 'Cuidados com a Pele', 'skincare', ARRAY['skincare','hidratante','protetor solar','sérum','serum','tônico']),
    ('category', 'Cabelo', 'cabelo', ARRAY['shampoo','condicionador','máscara capilar','progressiva','tintura']),
    -- Saúde e suplementos
    ('category', 'Suplementos', 'suplementos', ARRAY['whey','creatina','suplemento','proteína','protein','bcaa','glutamina']),
    ('category', 'Vitaminas', 'vitaminas', ARRAY['vitamina','multivitamínico','vitamina c','vitamina d','ômega 3','omega 3']),
    ('category', 'Esportes e Fitness', 'esportes-fitness', ARRAY['halter','anilha','barra','esteira','bike','bicicleta','fitness']),
    -- Bebê e infantil
    ('category', 'Brinquedos', 'brinquedos', ARRAY['brinquedo','boneca','lego','playmobil','quebra-cabeça','jogo de tabuleiro']),
    ('category', 'Bebê', 'bebe', ARRAY['fralda','mamadeira','carrinho de bebê','berço','chupeta']),
    -- Automotivo
    ('category', 'Automotivo', 'automotivo', ARRAY['pneu','óleo','bateria automotiva','som automotivo','acessório carro']),
    -- Pet
    ('category', 'Pet Shop', 'pet-shop', ARRAY['ração','petisco','coleira','arranhador','aquário','pet','cachorro','gato']),
    -- Livros e cultura
    ('category', 'Livros', 'livros', ARRAY['livro','ebook','kindle']),
    -- Ferramentas
    ('category', 'Ferramentas', 'ferramentas', ARRAY['furadeira','parafusadeira','chave de fenda','martelo','serra'])
ON CONFLICT (type, slug) DO NOTHING;

-- Marcas populares
INSERT INTO taxonomy (type, name, slug, keywords) VALUES
    -- Tecnologia
    ('brand', 'Apple', 'apple', ARRAY['apple','iphone','ipad','macbook','airpods']),
    ('brand', 'Samsung', 'samsung', ARRAY['samsung','galaxy']),
    ('brand', 'Xiaomi', 'xiaomi', ARRAY['xiaomi','redmi','poco']),
    ('brand', 'Motorola', 'motorola', ARRAY['motorola','moto g','moto e','moto edge']),
    ('brand', 'LG', 'lg', ARRAY['lg']),
    ('brand', 'Sony', 'sony', ARRAY['sony','playstation','wh-','xm']),
    ('brand', 'Microsoft', 'microsoft', ARRAY['microsoft','xbox','surface']),
    ('brand', 'Nintendo', 'nintendo', ARRAY['nintendo','switch']),
    ('brand', 'JBL', 'jbl', ARRAY['jbl']),
    ('brand', 'Bose', 'bose', ARRAY['bose']),
    ('brand', 'Dell', 'dell', ARRAY['dell','inspiron','xps','vostro']),
    ('brand', 'Lenovo', 'lenovo', ARRAY['lenovo','thinkpad','ideapad','legion']),
    ('brand', 'Acer', 'acer', ARRAY['acer','aspire','nitro','predator']),
    ('brand', 'Asus', 'asus', ARRAY['asus','zenbook','rog','tuf']),
    ('brand', 'HP', 'hp', ARRAY['hp','pavilion','envy','omen']),
    ('brand', 'NVIDIA', 'nvidia', ARRAY['nvidia','rtx','geforce']),
    ('brand', 'AMD', 'amd', ARRAY['amd','ryzen','radeon','rx ']),
    ('brand', 'Intel', 'intel', ARRAY['intel','core i','i3','i5','i7','i9']),
    ('brand', 'Logitech', 'logitech', ARRAY['logitech','mx ','g pro']),
    ('brand', 'Razer', 'razer', ARRAY['razer','blackwidow','deathadder']),
    -- Eletrodomésticos
    ('brand', 'Brastemp', 'brastemp', ARRAY['brastemp']),
    ('brand', 'Consul', 'consul', ARRAY['consul']),
    ('brand', 'Electrolux', 'electrolux', ARRAY['electrolux']),
    ('brand', 'Philips', 'philips', ARRAY['philips','walita']),
    ('brand', 'Mondial', 'mondial', ARRAY['mondial']),
    ('brand', 'Britânia', 'britania', ARRAY['britânia','britania']),
    -- Moda e calçados
    ('brand', 'Nike', 'nike', ARRAY['nike','air max','jordan','dunk']),
    ('brand', 'Adidas', 'adidas', ARRAY['adidas','superstar','stan smith','samba']),
    ('brand', 'Puma', 'puma', ARRAY['puma']),
    ('brand', 'Mizuno', 'mizuno', ARRAY['mizuno']),
    ('brand', 'New Balance', 'new-balance', ARRAY['new balance']),
    ('brand', 'Vans', 'vans', ARRAY['vans']),
    ('brand', 'Olympikus', 'olympikus', ARRAY['olympikus']),
    -- Suplementos
    ('brand', 'Growth Supplements', 'growth', ARRAY['growth','growth supplements']),
    ('brand', 'Max Titanium', 'max-titanium', ARRAY['max titanium']),
    ('brand', 'Integralmédica', 'integralmedica', ARRAY['integralmédica','integralmedica']),
    ('brand', 'Optimum Nutrition', 'optimum-nutrition', ARRAY['optimum nutrition','on whey','gold standard']),
    ('brand', 'Probiótica', 'probiotica', ARRAY['probiótica','probiotica']),
    ('brand', 'Black Skull', 'black-skull', ARRAY['black skull']),
    -- Beleza
    ('brand', 'Natura', 'natura', ARRAY['natura']),
    ('brand', 'O Boticário', 'o-boticario', ARRAY['boticário','boticario']),
    ('brand', 'L Oréal', 'loreal', ARRAY['l''oréal','loreal','l oréal']),
    -- Pet
    ('brand', 'Royal Canin', 'royal-canin', ARRAY['royal canin']),
    ('brand', 'Premier', 'premier', ARRAY['premier pet']),
    ('brand', 'Pedigree', 'pedigree', ARRAY['pedigree']),
    ('brand', 'Whiskas', 'whiskas', ARRAY['whiskas'])
ON CONFLICT (type, slug) DO NOTHING;

-- migrate:down
-- noop
