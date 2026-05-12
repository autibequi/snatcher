package curator

import (
	"fmt"
	"strings"
)

// ClassifiedMessage é o resultado da classificação de um evento.
type ClassifiedMessage struct {
	Target  string   // "critical" | "tracking" | "ignore"
	Message string   // PT-BR formatado
	Actions []string // sugestões de resposta
}

// Classify é a versão heurística do curator (sem LLM call por ora).
// LLM real é refactor futuro.
func Classify(events []Event) []ClassifiedMessage {
	out := []ClassifiedMessage{}
	for _, e := range events {
		target := "ignore"
		if e.Severity == "critical" {
			target = "critical"
		} else if e.Severity == "warning" {
			target = "tracking"
		}

		var msg strings.Builder
		switch e.Kind {
		case "ban":
			fmt.Fprintf(&msg, "🚨 *Banimento detectado*\nModem: %v\nConta: %v\nMotivo: %v",
				e.ScopeID, e.Detail["account_id"], e.Detail["reason"])
		case "system_pause":
			fmt.Fprintf(&msg, "⏸️ *Pause sistêmico*\nTrigger: %v\nMotivo: %v",
				e.Detail["triggered_by"], e.Detail["reasoning"])
		case "heartbeat_stale":
			fmt.Fprintf(&msg, "💤 *Componente sem heartbeat*\nComponente: %v\nÚltimo beat: %v",
				e.Detail["component"], e.Detail["last_beat"])
		case "loop_strike":
			fmt.Fprintf(&msg, "⚠️ *Loop LLM em suggesting*\nLoop: %v\nStrikes: %v",
				e.Detail["loop_name"], e.Detail["strikes"])
		case "anomaly":
			fmt.Fprintf(&msg, "🔥 *Anomalia detectada*\nEscopo: %v %v\nBans 24h: %v\nFalhas 24h: %v/%v",
				e.Scope, e.Detail["label"], e.Detail["bans_24h"], e.Detail["failed_24h"], e.Detail["total_24h"])
		case "group_decay":
			fmt.Fprintf(&msg, "📉 *Grupo em decay*\nGrupo: %v\nCTR drop: %v%%\nSentiment: %v\nMsgs 14d: %v",
				e.Detail["name"], e.Detail["ctr_drop_pct"], e.Detail["sentiment_score"], e.Detail["sent_14d"])
		default:
			fmt.Fprintf(&msg, "ℹ️ %v: %+v", e.Kind, e.Detail)
		}

		var actions []string
		switch e.Kind {
		case "ban":
			actions = []string{"pausar modem", "ignorar", "investigar"}
		case "system_pause":
			actions = []string{"manter pause", "retomar", "investigar"}
		case "loop_strike":
			actions = []string{"reativar loop", "deixar suggesting", "ignorar"}
		case "group_decay":
			actions = []string{"reduzir cap", "pausar grupo", "ignorar"}
		}

		if len(actions) > 0 {
			msg.WriteString("\n\nAções: ")
			msg.WriteString(strings.Join(actions, " / "))
		}

		out = append(out, ClassifiedMessage{Target: target, Message: msg.String(), Actions: actions})
	}
	return out
}
