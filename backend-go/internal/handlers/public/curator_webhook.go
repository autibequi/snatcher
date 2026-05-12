package public

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"snatcher/backendv2/internal/curator"

	"github.com/jmoiron/sqlx"
)

// EvolutionWebhookPayload — formato simplificado da Evolution API.
type EvolutionWebhookPayload struct {
	Event    string `json:"event"`
	Instance string `json:"instance"`
	Data     struct {
		Key struct {
			RemoteJID string `json:"remoteJid"`
			FromMe    bool   `json:"fromMe"`
		} `json:"key"`
		Message struct {
			Conversation string `json:"conversation"`
		} `json:"message"`
		PushName string `json:"pushName"`
	} `json:"data"`
}

// CuratorWebhookHandler recebe mensagens da Evolution e processa se vier do grupo curador.
func CuratorWebhookHandler(db *sqlx.DB, confirmer *curator.Confirmer, sender curator.Sender) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var p EvolutionWebhookPayload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}

		// ignorar mensagens próprias, sem JID, ou sem texto
		if p.Data.Key.FromMe || p.Data.Key.RemoteJID == "" || p.Data.Message.Conversation == "" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		ctx := r.Context()

		// verificar se o JID pertence a um grupo curador
		var isCurator bool
		err := db.GetContext(ctx, &isCurator,
			`SELECT COALESCE(is_curator_group, false) FROM groups WHERE jid=$1`,
			p.Data.Key.RemoteJID,
		)
		if err != nil || !isCurator {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		text := p.Data.Message.Conversation
		normalized := strings.ToLower(strings.TrimSpace(text))

		// confirmação implícita: "sim" / "yes" / "ok" / "👍"
		if normalized == "sim" || normalized == "yes" || normalized == "ok" || normalized == "👍" {
			if confirmed, ok := confirmer.TryConfirm(p.Data.Key.RemoteJID); ok {
				if err := curator.ExecuteIntent(ctx, db, confirmed); err != nil {
					slog.Error("curator.webhook: execute confirmed intent", "err", err)
					_ = sender.SendText(ctx, p.Instance, p.Data.Key.RemoteJID, "❌ Erro ao aplicar: "+err.Error())
				} else {
					_ = sender.SendText(ctx, p.Instance, p.Data.Key.RemoteJID, "✅ Aplicado.")
				}
			} else {
				_ = sender.SendText(ctx, p.Instance, p.Data.Key.RemoteJID, "Não há nada pendente para confirmar.")
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}

		intent := curator.ParseIntent(text)
		slog.Info("curator.webhook: intent parsed",
			"action", intent.Action,
			"target_id", intent.TargetID,
			"confidence", intent.Confidence,
			"jid", p.Data.Key.RemoteJID,
		)

		// ações sem impacto: registrar e ignorar
		if intent.Action == "ignore" || intent.Action == "unknown" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// ações com impacto: pedir confirmação 60s
		confirmer.Stage(p.Data.Key.RemoteJID, intent)
		confirmMsg := "Aplicar ação \"" + intent.Action + "\" no target " +
			strconv.FormatInt(intent.TargetID, 10) + "? Responde *sim* em 60s para confirmar."
		_ = sender.SendText(ctx, p.Instance, p.Data.Key.RemoteJID, confirmMsg)

		w.WriteHeader(http.StatusNoContent)
	}
}
