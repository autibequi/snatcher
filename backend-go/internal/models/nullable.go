package models

import (
	"database/sql"
	"encoding/json"
	"time"
)

// Helpers para construir Null* sem o boilerplate {NullX: sql.NullX{X: v, Valid: true}}.
// Passar string vazia / zero gera Valid:false (semântica "ausente").

func NewNullString(s string) NullString {
	return NullString{NullString: sql.NullString{String: s, Valid: s != ""}}
}

func NewNullInt64(i int64) NullInt64 {
	return NullInt64{NullInt64: sql.NullInt64{Int64: i, Valid: i != 0}}
}

func NewNullFloat64(f float64) NullFloat64 {
	return NullFloat64{NullFloat64: sql.NullFloat64{Float64: f, Valid: f != 0}}
}

func NewNullTime(t time.Time) NullTime {
	return NullTime{NullTime: sql.NullTime{Time: t, Valid: !t.IsZero()}}
}

// NullString serializa como string JSON ou null (não como {String, Valid}).
type NullString struct {
	sql.NullString
}

func (n NullString) MarshalJSON() ([]byte, error) {
	if !n.Valid {
		return []byte("null"), nil
	}
	return json.Marshal(n.String)
}

func (n *NullString) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		n.Valid = false
		return nil
	}
	n.Valid = true
	return json.Unmarshal(data, &n.String)
}

// NullInt64 serializa como número JSON ou null.
type NullInt64 struct {
	sql.NullInt64
}

func (n NullInt64) MarshalJSON() ([]byte, error) {
	if !n.Valid {
		return []byte("null"), nil
	}
	return json.Marshal(n.Int64)
}

func (n *NullInt64) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		n.Valid = false
		return nil
	}
	n.Valid = true
	return json.Unmarshal(data, &n.Int64)
}

// NullFloat64 serializa como número JSON ou null.
type NullFloat64 struct {
	sql.NullFloat64
}

func (n NullFloat64) MarshalJSON() ([]byte, error) {
	if !n.Valid {
		return []byte("null"), nil
	}
	return json.Marshal(n.Float64)
}

func (n *NullFloat64) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		n.Valid = false
		return nil
	}
	n.Valid = true
	return json.Unmarshal(data, &n.Float64)
}

// NullTime serializa como string RFC3339 ou null.
type NullTime struct {
	sql.NullTime
}

func (n NullTime) MarshalJSON() ([]byte, error) {
	if !n.Valid {
		return []byte("null"), nil
	}
	return json.Marshal(n.Time)
}

func (n *NullTime) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		n.Valid = false
		return nil
	}
	n.Valid = true
	return json.Unmarshal(data, &n.Time)
}
