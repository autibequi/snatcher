-- Adiciona modem HOST (máquina local/Evolution direta) como primeiro modem do sistema
INSERT INTO modems (slug, interface_name, status)
VALUES ('host', 'host', 'active')
ON CONFLICT (slug) DO NOTHING;
