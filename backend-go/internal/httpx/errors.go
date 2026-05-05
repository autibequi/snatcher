package httpx

import (
	"encoding/json"
	"net/http"

	"github.com/go-playground/validator/v10"
)

type fieldError struct {
	Field  string `json:"field"`
	Reason string `json:"reason"`
}

type validationErrorResponse struct {
	Error  string       `json:"error"`
	Fields []fieldError `json:"fields"`
}

// WriteValidationError writes a structured 400 JSON response for validator.ValidationErrors.
// Format: {"error":"validation","fields":[{"field":"X","reason":"required"}]}
func WriteValidationError(w http.ResponseWriter, err error) {
	var ve validator.ValidationErrors
	fields := []fieldError{}

	if errs, ok := err.(validator.ValidationErrors); ok {
		ve = errs
		for _, fe := range ve {
			fields = append(fields, fieldError{
				Field:  fe.Field(),
				Reason: fe.Tag(),
			})
		}
	}

	resp := validationErrorResponse{
		Error:  "validation",
		Fields: fields,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	_ = json.NewEncoder(w).Encode(resp)
}
