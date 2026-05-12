-- Habilita normalização de acentos para o matching de taxonomia.
-- Sem isso, keywords como "fogão" não batem com títulos "fogao", forçando
-- o operador (e o LLM auto-tag) a cadastrar variantes duplicadas.
CREATE EXTENSION IF NOT EXISTS unaccent;
