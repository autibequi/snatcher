package admin

import (
	"crypto/rand"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const uploadDir = "/data/uploads"
const maxUploadSize = 10 << 20 // 10 MB

// UploadImage POST /api/uploads/image
// Recebe multipart field "file", salva em /data/uploads/{subdir}/{uuid}.{ext}
// Retorna { "url": "/uploads/{subdir}/{uuid}.{ext}" }
func UploadImage(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		writeErr(w, http.StatusBadRequest, "arquivo muito grande (max 10MB)")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "campo 'file' ausente")
		return
	}
	defer file.Close()

	// Valida content type
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	ct := http.DetectContentType(buf[:n])
	if !strings.HasPrefix(ct, "image/") {
		writeErr(w, http.StatusBadRequest, "arquivo não é uma imagem")
		return
	}
	file.Seek(0, 0) //nolint

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == "" {
		switch ct {
		case "image/jpeg":
			ext = ".jpg"
		case "image/png":
			ext = ".png"
		case "image/webp":
			ext = ".webp"
		case "image/gif":
			ext = ".gif"
		default:
			ext = ".bin"
		}
	}

	subdir := r.URL.Query().Get("subdir")
	if subdir == "" {
		subdir = "misc"
	}
	subdir = filepath.Clean(subdir)
	if strings.Contains(subdir, "..") {
		writeErr(w, http.StatusBadRequest, "subdir inválido")
		return
	}

	dir := filepath.Join(uploadDir, subdir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar diretório")
		return
	}

	// UUID curto (8 bytes hex)
	ub := make([]byte, 8)
	rand.Read(ub) //nolint
	fname := fmt.Sprintf("%x%s", ub, ext)
	dest := filepath.Join(dir, fname)

	f, err := os.Create(dest)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao salvar arquivo")
		return
	}
	defer f.Close()
	if _, err := io.Copy(f, file); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao gravar arquivo")
		return
	}

	url := "/uploads/" + subdir + "/" + fname
	writeJSON(w, http.StatusOK, map[string]string{"url": url})
}
