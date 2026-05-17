package messaging

import "errors"

var (
	ErrNotConnected    = errors.New("messaging: account not connected")
	ErrRateLimited     = errors.New("messaging: rate limited by platform")
	ErrInvalidTarget   = errors.New("messaging: invalid target")
	ErrNotFound        = errors.New("messaging: provider not found")
	ErrNotImplemented  = errors.New("messaging: not implemented")
)
