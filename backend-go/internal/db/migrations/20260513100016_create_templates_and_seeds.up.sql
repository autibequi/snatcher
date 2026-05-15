-- Cria tabela templates com 25 seeds (5 variações × 5 categorias) com slots de substituição
CREATE TABLE IF NOT EXISTS templates (
    id          BIGSERIAL PRIMARY KEY,
    category_id BIGINT NOT NULL REFERENCES categories(id),
    body        TEXT NOT NULL,   -- com {titulo} {preco_de} {preco_por} {link} {emoji} {desconto} ...
    weight      INT NOT NULL DEFAULT 1,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Eletrônicos (eletronico) ─────────────────────────────────────────────────
INSERT INTO templates (category_id, body, weight) VALUES
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'🔥 {titulo}\nDe {preco_de} por apenas {preco_por} ({desconto}% OFF)\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'⚡ Oferta relâmpago em eletrônicos!\n{titulo}\n💰 {preco_por} (era {preco_de})\n👉 {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'{emoji} {titulo}\nPreço: {preco_por}\nEconomize {desconto}%\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Promoção imperdível! {titulo}\n{preco_de} → {preco_por}\nAcesse: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'🎯 {titulo}\n✅ {preco_por} ({desconto}% de desconto)\n🔗 {link}',
    1
)
ON CONFLICT DO NOTHING;

-- ── Gaming ───────────────────────────────────────────────────────────────────
INSERT INTO templates (category_id, body, weight) VALUES
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'🎮 {titulo}\nDe {preco_de} por {preco_por} — {desconto}% OFF!\n👾 {link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'🕹️ Gamer, aproveita!\n{titulo}\n💸 {preco_por} (era {preco_de})\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'{emoji} {titulo}\nPreço: {preco_por}\nDesconto: {desconto}%\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'Promoção gaming! {titulo}\n{preco_de} → {preco_por}\nClique: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'🏆 {titulo}\n✅ {preco_por} com {desconto}% OFF\n🔗 {link}',
    1
)
ON CONFLICT DO NOTHING;

-- ── Casa ─────────────────────────────────────────────────────────────────────
INSERT INTO templates (category_id, body, weight) VALUES
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'🏠 {titulo}\nDe {preco_de} por {preco_por} ({desconto}% OFF)\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'✨ Sua casa merece!\n{titulo}\n💰 {preco_por} (era {preco_de})\n👉 {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'{emoji} {titulo}\nPreço: {preco_por}\nEconomize {desconto}%\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'Oferta casa! {titulo}\n{preco_de} → {preco_por}\nAcesse: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'🛋️ {titulo}\n✅ {preco_por} ({desconto}% de desconto)\n🔗 {link}',
    1
)
ON CONFLICT DO NOTHING;

-- ── Moda ─────────────────────────────────────────────────────────────────────
INSERT INTO templates (category_id, body, weight) VALUES
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'👗 {titulo}\nDe {preco_de} por {preco_por} — {desconto}% OFF!\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'💃 Moda com desconto!\n{titulo}\n💸 {preco_por} (era {preco_de})\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'{emoji} {titulo}\nPreço: {preco_por}\nDesconto: {desconto}%\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'Look incrível por menos! {titulo}\n{preco_de} → {preco_por}\nClique: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'👠 {titulo}\n✅ {preco_por} com {desconto}% OFF\n🔗 {link}',
    1
)
ON CONFLICT DO NOTHING;

-- ── Geral ────────────────────────────────────────────────────────────────────
INSERT INTO templates (category_id, body, weight) VALUES
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'🔥 {titulo}\nDe {preco_de} por {preco_por} ({desconto}% OFF)\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'⚡ Promoção imperdível!\n{titulo}\n💰 {preco_por} (era {preco_de})\n👉 {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'{emoji} {titulo}\nPreço: {preco_por}\nEconomize {desconto}%\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Aproveita! {titulo}\n{preco_de} → {preco_por}\nAcesse: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'🎯 {titulo}\n✅ {preco_por} ({desconto}% de desconto)\n🔗 {link}',
    1
)
ON CONFLICT DO NOTHING;
