package senders

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"snatcher/backendv2/internal/httpx"
)

// readErrBody extrai um trecho do corpo da resposta de erro da Evolution.
// O corpo é o que distingue "mídia/conteúdo rejeitado" de "sessão/conta morta"
// na classificação de isBanIndicativeError — sem ele o classificador decide cego
// e pune a conta por um 400 que era só uma imagem ruim.
func readErrBody(resp *http.Response) string {
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	return strings.TrimSpace(string(b))
}

// SendMediaArgs encapsula args para envio multimodal.
type SendMediaArgs struct {
	Instance  string
	JID       string
	Caption   string
	ImagePath string
}

// SendTextWithMedia envia mensagem com imagem via Evolution /message/sendMedia.
// Fallback para text-only se imagem ausente ou caminho vazio.
func SendTextWithMedia(ctx context.Context, args SendMediaArgs) error {
	baseURL := os.Getenv("EVOLUTION_URL")
	apiKey := os.Getenv("EVOLUTION_API_KEY")
	if baseURL == "" {
		return fmt.Errorf("evolution_url empty")
	}

	httpCli := httpx.NewClient(30*time.Second, "snatcher-sender-media")

	if args.ImagePath == "" {
		body, _ := json.Marshal(map[string]any{"number": args.JID, "text": args.Caption})
		req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/message/sendText/"+args.Instance, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("apikey", apiKey)
		req.Header.Set("Content-Type", "application/json")
		resp, err := httpCli.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 300 {
			return fmt.Errorf("evolution sendText status %d: %s", resp.StatusCode, readErrBody(resp))
		}
		return nil
	}

	// Tenta enviar com mídia. Evolution aceita base64 via mediatype.
	imgBytes, err := os.ReadFile(args.ImagePath)
	if err != nil {
		return err
	}
	payload := map[string]any{
		"number":    args.JID,
		"mediatype": "image",
		"caption":   args.Caption,
		"media":     "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(imgBytes),
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/message/sendMedia/"+args.Instance, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("apikey", apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpCli.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("evolution sendMedia status %d: %s", resp.StatusCode, readErrBody(resp))
	}
	return nil
}

// PickTemplateByHour escolhe template considerando hora atual (optimal_hours).
// Fallback: weighted random global se nada bater com a hora fornecida.
func PickTemplateByHour(ctx context.Context, db *sqlx.DB, categoryID int64, hour int) (int64, bool) {
	var id int64
	err := db.GetContext(ctx, &id, `
		SELECT id FROM templates
		WHERE category_id = $1 AND enabled = true
		  AND (optimal_hours IS NULL OR $2 = ANY(optimal_hours))
		ORDER BY random() * weight DESC LIMIT 1
	`, categoryID, hour)
	if err != nil {
		return 0, false
	}
	return id, true
}
