package jobs

import "testing"

func TestIsValidTaxonomySlug(t *testing.T) {
	cases := []struct {
		s    string
		want bool
	}{
		{"adidas", true},
		{"new-balance", true},
		{"a1", true},
		{"generic", true},
		{"", false},
		{"a", false},
		{",", false},
		{":", false},
		{"foo,bar", false},
		{"foo bar", false},
		{"-x", false},
		{"x-", false},
		{"x--y", false},
	}
	for _, tc := range cases {
		if got := isValidTaxonomySlug(tc.s); got != tc.want {
			t.Errorf("isValidTaxonomySlug(%q) = %v, want %v", tc.s, got, tc.want)
		}
	}
}
