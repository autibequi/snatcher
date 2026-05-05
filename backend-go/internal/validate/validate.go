package validate

import "github.com/go-playground/validator/v10"

// V is the shared validator instance used across all handlers.
var V = validator.New()
