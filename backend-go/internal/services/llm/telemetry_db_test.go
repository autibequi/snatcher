package llm

import "testing"

func TestTruncateString_limits(t *testing.T) {
	cases := []struct {
		name   string
		in     string
		max    int
		suffix string
		want   string
	}{
		{"short_passthrough", "abc", 10, "...", "abc"},
		{"exact_boundary", "abcdefghij", 10, "...", "abcdefghij"},
		{"truncates_long", "abcdefghijklm", 10, "...", "abcdefghij..."},
		{"empty_input", "", 5, "...", ""},
		{"zero_max_passthrough", "abc", 0, "...", "abc"},
		{"negative_max_passthrough", "abc", -1, "...", "abc"},
		{"unicode_byte_boundary", "ãéí", 2, "x", "ãx"},      // cut em 2 bytes pega "ã" completa (2B)
		{"unicode_mid_codepoint", "ãéí", 3, "x", "\xc3\xa3\xc3x"}, // documenta byte-aware: corta mid-codepoint
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := TruncateString(tc.in, tc.max, tc.suffix)
			if got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}

func TestTruncatePayload_delegates(t *testing.T) {
	short := "abc"
	if got := truncatePayload(short); got != short {
		t.Fatalf("short: got %q want %q", got, short)
	}

	long := make([]byte, maxPayloadStoreLen+50)
	for i := range long {
		long[i] = 'x'
	}
	got := truncatePayload(string(long))
	expectedLen := maxPayloadStoreLen + len("... [truncated]")
	if len(got) != expectedLen {
		t.Fatalf("len=%d want=%d", len(got), expectedLen)
	}
}
