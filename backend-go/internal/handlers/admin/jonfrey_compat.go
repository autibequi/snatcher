package admin

// Shim de compatibilidade — refactor 2026-06 (W1).
//
// O handler de automações Jonfrey (antigo jonfrey.go) e o serviço jonfrey_regulator
// foram removidos no corte da camada de otimização automática (ver reavaliação
// 2026-06-13: "otimização automática só depois do core"). As rotas /api/jonfrey/*
// e o tick no scheduler também saíram — nada mais ESCREVE em jonfrey_actions.
//
// Estes dois símbolos eram definidos no jonfrey.go removido e ainda são consumidos
// pela LEITURA residual de jonfrey_actions no dashboard e no work_queue. Mantidos
// como shim mínimo até a remoção completa do resíduo Jonfrey (follow-up).
const jonfreyStaleRunningMin = 30 // min acima dos quais uma ação 'running' vira falha (> timeout ~22m por ação)

// resolveJonfreyActionType normaliza um action_type para sua forma canônica.
// Sem a tabela de aliases do handler removido, opera como identidade — seguro
// porque a automação não gera mais novas linhas em jonfrey_actions.
func resolveJonfreyActionType(actionType string) string {
	return actionType
}
