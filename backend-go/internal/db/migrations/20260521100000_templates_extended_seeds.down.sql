-- Remove seeds adicionais (mantém os 25 originais da migration create_templates_and_seeds)
DELETE FROM templates WHERE id > 25;
