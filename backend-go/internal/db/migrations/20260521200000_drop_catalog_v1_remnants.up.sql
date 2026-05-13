-- Remove o parâmetro strangler catalog_source (v1 encerrado, catalog v2 é o único)
DELETE FROM tunable_parameters WHERE param_name = 'catalog_source';

-- Remove o job fold_catalog da tabela de jobs se houver registro pendente
DELETE FROM background_jobs WHERE kind = 'fold_catalog';
