package eval

import (
	"testing"
)

func TestScorer_ExactMatch(t *testing.T) {
	s := &Scorer{}
	tests := []struct {
		name     string
		output   string
		expected string
		want     bool
	}{
		{"exact", "hello", "hello", true},
		{"spaces", "  hello  ", "hello", true},
		{"different", "hello", "world", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := s.ExactMatch(tt.output, tt.expected); got != tt.want {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestScorer_SchemaValid(t *testing.T) {
	s := &Scorer{}
	tests := []struct {
		name   string
		output string
		want   bool
	}{
		{"valid json", `{"a":1}`, true},
		{"invalid json", `{a:1}`, false},
		{"empty object", `{}`, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := s.SchemaValid(tt.output); got != tt.want {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestScorer_ContainsKeywords(t *testing.T) {
	s := &Scorer{}
	tests := []struct {
		name     string
		output   string
		keywords []string
		want     bool
	}{
		{"all found", "hello world", []string{"hello", "world"}, true},
		{"one found", "hello world", []string{"hello"}, true},
		{"missing", "hello world", []string{"foo"}, false},
		{"case insensitive", "Hello World", []string{"hello"}, true},
		{"empty keywords", "hello", []string{}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := s.ContainsKeywords(tt.output, tt.keywords); got != tt.want {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestScorer_JSONExtract(t *testing.T) {
	s := &Scorer{}
	json := `{"name":"John","age":30}`
	tests := []struct {
		name    string
		path    string
		want    any
		wantErr bool
	}{
		{"field", "name", "John", false},
		{"number", "age", float64(30), false},
		{"missing", "missing", nil, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := s.JSONExtract(json, tt.path)
			if (err != nil) != tt.wantErr {
				t.Errorf("error %v, want %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestScorer_CosineSimilarity(t *testing.T) {
	s := &Scorer{}
	tests := []struct {
		name string
		a    string
		b    string
		min  float64 // score >= min
	}{
		{"identical", "hello world", "hello world", 0.99},
		{"one word match", "hello world", "hello", 0.5},
		{"no match", "abc xyz", "def ghi", 0.0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := s.CosineSimilarity(tt.a, tt.b)
			if got < tt.min {
				t.Errorf("got %v, want >= %v", got, tt.min)
			}
		})
	}
}

func TestLatencyPercentile(t *testing.T) {
	tests := []struct {
		name       string
		latencies  []int64
		percentile float64
		min        float64
		max        float64
	}{
		{"p50", []int64{1, 2, 3, 4, 5}, 50, 2.5, 3.5},
		{"p100", []int64{1, 2, 3, 4, 5}, 100, 4.9, 5.1},
		{"empty", []int64{}, 50, -0.1, 0.1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := LatencyPercentile(tt.latencies, tt.percentile)
			if got < tt.min || got > tt.max {
				t.Errorf("got %v, want in [%v, %v]", got, tt.min, tt.max)
			}
		})
	}
}
