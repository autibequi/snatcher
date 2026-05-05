package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"snatcher/backendv2/internal/httpx"
	"snatcher/backendv2/internal/validate"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func pathInt(r *http.Request, key string) (int64, bool) {
	s := chi.URLParam(r, key)
	n, err := strconv.ParseInt(s, 10, 64)
	return n, err == nil
}

func decodeBody(r *http.Request, v any) error {
	return json.NewDecoder(r.Body).Decode(v)
}

// decodeAndValidate decodes the JSON body and runs go-playground/validator on the result.
// Returns a non-nil error for both malformed JSON and validation failures.
// Callers should use writeValidationErr to produce the correct 400 response.
func decodeAndValidate(r *http.Request, v any) error {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		return err
	}
	return validate.V.Struct(v)
}

// writeValidationErr writes the appropriate 400 response depending on error type:
// - validator.ValidationErrors → structured {"error":"validation","fields":[...]}
// - any other error (malformed JSON) → {"error":"invalid body"}
func writeValidationErr(w http.ResponseWriter, err error) {
	if _, ok := err.(validator.ValidationErrors); ok {
		httpx.WriteValidationError(w, err)
		return
	}
	writeErr(w, http.StatusBadRequest, "invalid body")
}

func sqlNullString(s string) sql.NullString {
	return sql.NullString{String: s, Valid: s != ""}
}
