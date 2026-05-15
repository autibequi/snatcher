-- 100+ variações de templates para submissão à Meta (WhatsApp Business API)
-- Variáveis: {titulo} {preco_de} {preco_por} {desconto} {link} {emoji}

-- ── Eletrônicos — 22 variações adicionais ───────────────────────────────────
INSERT INTO templates (category_id, body, weight) VALUES
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'📱 Oferta do dia!\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\nEconomia real: {desconto}% OFF 🔥\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Encontrei essa oferta e precisei compartilhar:\n\n{titulo}\n✅ R$ {preco_por} (era R$ {preco_de})\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'🛒 {titulo}\n\nPreço atual: R$ {preco_por}\nDesconto: {desconto}%\n\nVeja mais: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'ALERTA DE PREÇO 🚨\n{titulo}\nR$ {preco_de} → R$ {preco_por}\nDesconto de {desconto}%\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Tá na hora de renovar!\n\n{titulo}\n💸 R$ {preco_por} ({desconto}% de desconto)\n👉 {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'{emoji} {titulo}\n\nAntes: R$ {preco_de}\nAgora: R$ {preco_por}\nLink: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Produto em destaque hoje 🌟\n\n{titulo}\nPreço promocional: R$ {preco_por}\nEra: R$ {preco_de}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'⚡ Relâmpago!\n{titulo}\nSó R$ {preco_por} — {desconto}% de economia\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Preço mínimo detectado 📉\n{titulo}\nR$ {preco_por} ({desconto}% OFF)\nAcesse: {link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Que tal esse eletrônico? 😍\n{titulo}\nDe R$ {preco_de} por apenas R$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'🔔 Notificação de oferta\n\n{titulo}\nPreço: R$ {preco_por}\nDesconto: {desconto}%\nAcesse agora: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'{titulo}\n\nEste produto caiu {desconto}%!\nDe R$ {preco_de} para R$ {preco_por}\n🔗 {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Vixi, que preço bom! 😱\n{titulo}\nR$ {preco_por} — {desconto}% de desconto\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'📊 Histórico de preço atingiu mínimo!\n{titulo}\nAgora: R$ {preco_por}\nAntes: R$ {preco_de}\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'🎁 Presente pra você:\n{titulo}\nR$ {preco_por} com {desconto}% OFF\nClique: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Compra inteligente do dia 💡\n{titulo}\nR$ {preco_de} → R$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'🔥 {titulo} em promoção!\nEra R$ {preco_de}, agora R$ {preco_por}\n{desconto}% de economia real\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Oferta especial de eletrônicos 💻\n{titulo}\n💰 R$ {preco_por} ({desconto}% OFF)\nSaiba mais: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'{emoji} Achado do dia!\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\nAproveite: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Preço abaixo da média do mercado 📉\n\n{titulo}\nR$ {preco_por} — {desconto}% OFF\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Você pediu, encontrei! 🙌\n{titulo}\nR$ {preco_por} (economize {desconto}%)\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'🌟 Destaque da semana\n{titulo}\nPreço: R$ {preco_por}\nDesconto: {desconto}%\n{link}',
    1
)
ON CONFLICT DO NOTHING;

-- ── Gaming — 22 variações adicionais ────────────────────────────────────────
INSERT INTO templates (category_id, body, weight) VALUES
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'GG! Oferta épica encontrada 🎮\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\n{desconto}% de desconto\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'Level up no bolso! 🏆\n{titulo}\nR$ {preco_por} (era R$ {preco_de})\n👉 {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'🕹️ Gamer esperto economiza!\n{titulo}\nPreço: R$ {preco_por} ({desconto}% OFF)\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'Missão: economizar desbloqueada ✅\n{titulo}\nR$ {preco_de} → R$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'⚔️ Oferta lendária detectada!\n{titulo}\n{desconto}% de desconto\nR$ {preco_por} — {link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'Nova oferta na fila 🎯\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\nAcesse: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'🎮 {titulo}\n\nPreço de mercado: R$ {preco_de}\nNosso preço: R$ {preco_por}\nEconomia: {desconto}%\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'Speedrun de economia! ⚡\n{titulo}\nR$ {preco_por} com {desconto}% OFF\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'Conquista desbloqueada: oferta incrível 🥇\n{titulo}\nR$ {preco_por} ({desconto}% de desconto)\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'🔥 Hot deal para gamers!\n{titulo}\nAntes: R$ {preco_de}\nAgora: R$ {preco_por}\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'Respawn no orçamento 💚\n{titulo}\nR$ {preco_de} → R$ {preco_por}\nLink: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'🎯 Drop de oferta!\n{titulo}\nR$ {preco_por} — economize {desconto}%\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'Patch de desconto aplicado 🛠️\n{titulo}\nNovo preço: R$ {preco_por} ({desconto}% OFF)\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'Inventário atualizado: nova oferta! 🎒\n{titulo}\nR$ {preco_por} — era R$ {preco_de}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'🏆 Oferta top tier!\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\n{desconto}% OFF\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'Finalizou! 🎮 Oferta imperdível\n{titulo}\nR$ {preco_por} com {desconto}% de desconto\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'🌟 Highlight do dia gamer\n{titulo}\nPreço: R$ {preco_por}\nDesconto: {desconto}%\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'Combo perfeito: produto + preço 🎮\n{titulo}\nR$ {preco_de} → R$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'🎲 Sorte grande!\n{titulo}\nSó R$ {preco_por} — {desconto}% de economia\nAproveite: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'Achievement desbloqueado: economia de {desconto}% 🏅\n{titulo}\nR$ {preco_por}\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'📡 Sinal de oferta detectado!\n{titulo}\nR$ {preco_por} ({desconto}% OFF)\nClique: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'gaming'),
    E'🎮 {titulo} por apenas R$ {preco_por}!\nDesconto de {desconto}% em relação ao preço original de R$ {preco_de}\n{link}',
    1
)
ON CONFLICT DO NOTHING;

-- ── Casa — 22 variações adicionais ──────────────────────────────────────────
INSERT INTO templates (category_id, body, weight) VALUES
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'🏠 Deixa a casa mais bonita gastando menos!\n{titulo}\nR$ {preco_por} ({desconto}% OFF)\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'Reforma sem pesar no bolso 🛠️\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'Achado de casa e decoração 🌿\n{titulo}\nR$ {preco_por} — {desconto}% de desconto\nVeja: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'🛋️ Oferta imperdível!\n{titulo}\nEra R$ {preco_de}, agora R$ {preco_por}\n{desconto}% de economia\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'Presente pra casa perfeito 🎁\n{titulo}\nR$ {preco_por} com {desconto}% OFF\nConfira: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'🌸 Novidade pro lar!\n{titulo}\nPreço especial: R$ {preco_por}\nEconomia: {desconto}%\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'Deixa o ambiente mais aconchegante ☕\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'🏡 {titulo}\n\nPreço do momento: R$ {preco_por}\nDesconto: {desconto}%\nAcesse: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'Promoção relâmpago de casa e jardim 🌱\n{titulo}\nR$ {preco_por} ({desconto}% OFF)\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'Tá na hora de renovar a decoração 🎨\n{titulo}\nR$ {preco_de} → R$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'💡 Ideia inteligente de compra!\n{titulo}\nR$ {preco_por} — economize {desconto}%\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'🛒 Compra do mês: casa e conforto\n{titulo}\nR$ {preco_por} com {desconto}% de desconto\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'Lar doce lar — com desconto! 🏠\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'🌟 Em destaque hoje:\n{titulo}\nPreço: R$ {preco_por} ({desconto}% OFF)\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'Economia de {desconto}% na sua casa 💰\n{titulo}\nR$ {preco_de} → R$ {preco_por}\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'🛁 Oferta de casa e cozinha!\n{titulo}\nR$ {preco_por} — era R$ {preco_de}\nConfira: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'Oferta que deixa qualquer casa mais bonita ✨\n{titulo}\nR$ {preco_por} ({desconto}% de desconto)\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'🌿 {titulo}\n\nEconômico e prático para o lar\nR$ {preco_por} — {desconto}% OFF\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'Investimento certo para o lar 🏡\n{titulo}\nR$ {preco_por} (era R$ {preco_de})\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'🎯 Oferta de {desconto}% OFF em casa!\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'Seu lar merece isso! 🏠\n{titulo}\nR$ {preco_por} com {desconto}% de economia\nVeja mais: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'casa'),
    E'🛒 Carrinho cheio, bolso não tão vazio!\n{titulo}\nR$ {preco_por} — {desconto}% OFF\n{link}',
    1
)
ON CONFLICT DO NOTHING;

-- ── Moda — 22 variações adicionais ──────────────────────────────────────────
INSERT INTO templates (category_id, body, weight) VALUES
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'Look incrível por menos! 👗\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\n{desconto}% OFF\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'Moda com inteligência 💄\n{titulo}\nR$ {preco_por} — era R$ {preco_de}\n{desconto}% de desconto\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'👠 Oferta de moda hoje!\n{titulo}\nR$ {preco_por} ({desconto}% OFF)\nAproveite: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'Estilo não precisa custar caro 🌟\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'👒 Tendência com desconto!\n{titulo}\nR$ {preco_por} — {desconto}% de economia\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'Guarda-roupa renovado por menos 🛍️\n{titulo}\nR$ {preco_de} → R$ {preco_por}\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'💃 Fashionista econômico!\n{titulo}\nR$ {preco_por} com {desconto}% OFF\nClique: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'Oferta de moda que vale a pena 👜\n{titulo}\nPreço: R$ {preco_por}\nDesconto: {desconto}%\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'🎀 {titulo}\n\nEra R$ {preco_de}\nAgora R$ {preco_por} ({desconto}% OFF)\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'Novidade: {titulo} com desconto! ✨\nR$ {preco_por} (economize {desconto}%)\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'👗 Achado de moda do dia!\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'Porque você merece se vestir bem por menos 💕\n{titulo}\nR$ {preco_por} — {desconto}% OFF\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'🛒 Promoção relâmpago de moda!\n{titulo}\nR$ {preco_de} → R$ {preco_por}\nAcesse: {link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'Roupa boa, preço melhor 👕\n{titulo}\nR$ {preco_por} — {desconto}% de desconto\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'💋 Oferta irrecusável de moda!\n{titulo}\nR$ {preco_por} com {desconto}% OFF\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'Tendência {emoji} + desconto = oferta perfeita!\n{titulo}\nR$ {preco_por} (era R$ {preco_de})\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'👟 Calce bem e gaste menos!\n{titulo}\nR$ {preco_por} — {desconto}% de economia\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'Presente de moda com {desconto}% de desconto 🎁\n{titulo}\nR$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'🌈 Colorido e econômico!\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'Seu estilo, seu preço 💫\n{titulo}\nR$ {preco_por} ({desconto}% OFF)\nVeja: {link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'👗 {titulo} em promoção hoje!\nEra R$ {preco_de}, agora R$ {preco_por}\n{desconto}% de economia\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'moda'),
    E'Moda acessível todo dia 🌟\n{titulo}\nR$ {preco_por} com {desconto}% de desconto\n{link}',
    1
)
ON CONFLICT DO NOTHING;

-- ── Geral — 22 variações adicionais ─────────────────────────────────────────
INSERT INTO templates (category_id, body, weight) VALUES
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Oferta do dia chegando! 🌅\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\n{desconto}% OFF\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Encontrei algo legal pra você 😊\n{titulo}\nR$ {preco_por} — {desconto}% de desconto\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'💥 Oferta bombando agora!\n{titulo}\nR$ {preco_de} → R$ {preco_por}\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Compra esperta do dia 🧠\n{titulo}\nR$ {preco_por} com {desconto}% de economia\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'{emoji} Preço mínimo histórico!\n{titulo}\nR$ {preco_por} ({desconto}% OFF)\nAcesse: {link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'🔔 Alerta de promoção!\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Você pediu por isso? 👇\n{titulo}\nR$ {preco_por} — {desconto}% OFF\nClique: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'💰 Economize R$ {desconto}% agora!\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Hot deal de hoje 🔥\n{titulo}\nR$ {preco_por} ({desconto}% de desconto)\nSaiba mais: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Aproveita que tá barato! 🙏\n{titulo}\nR$ {preco_de} → R$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'🌟 Produto em destaque\n{titulo}\nPreço especial: R$ {preco_por}\nDesconto: {desconto}%\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Radar de promoções ativado 📡\n{titulo}\nR$ {preco_por} — {desconto}% OFF\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Tá dormindo? Acorda! ⏰\n{titulo}\nR$ {preco_por} com {desconto}% de desconto\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'💡 Dica de economia:\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Corre que tá acabando! 🏃\n{titulo}\nR$ {preco_por} ({desconto}% OFF)\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'🎯 Produto certeiro!\n{titulo}\nR$ {preco_de} → R$ {preco_por}\nDesconto: {desconto}%\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Curti essa oferta e vou compartilhar 🙌\n{titulo}\nR$ {preco_por} — {desconto}% de desconto\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'🏷️ Etiqueta de preço atualizada!\n{titulo}\nNovo preço: R$ {preco_por} ({desconto}% OFF)\n{link}',
    2
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Oferta que não pode perder 💎\n{titulo}\nDe R$ {preco_de} por R$ {preco_por}\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'🛍️ Enchendo o carrinho!\n{titulo}\nR$ {preco_por} com {desconto}% de desconto\nVeja: {link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'Que oferta boa, hein? 😍\n{titulo}\nR$ {preco_de} → R$ {preco_por} ({desconto}% OFF)\n{link}',
    1
),
(
    (SELECT id FROM categories WHERE slug = 'eletronico'),
    E'📦 Chegou a oferta que você esperava!\n{titulo}\nR$ {preco_por} — {desconto}% de economia\n{link}',
    1
)
ON CONFLICT DO NOTHING;
