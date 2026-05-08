package model

import (
	"testing"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/arnab/is-dl-tui/api"
)

func newTestModel() Model {
	return New(&mockClient{})
}

func TestTabNavigation_NumberKeys(t *testing.T) {
	m := newTestModel()

	for _, tc := range []struct {
		key     string
		wantTab Tab
	}{
		{"1", TabScrape},
		{"2", TabLogs},
		{"3", TabResults},
	} {
		updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(tc.key)})
		got := updated.(Model).tab
		if got != tc.wantTab {
			t.Errorf("key %q: got tab %d, want %d", tc.key, got, tc.wantTab)
		}
	}
}

func TestTabNavigation_TabKey(t *testing.T) {
	m := newTestModel()
	m.tab = TabScrape

	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyTab})
	if updated.(Model).tab != TabLogs {
		t.Errorf("tab key from Scrape: expected TabLogs")
	}
}

func TestTabNavigation_ShiftTab(t *testing.T) {
	m := newTestModel()
	m.tab = TabLogs

	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyShiftTab})
	if updated.(Model).tab != TabScrape {
		t.Errorf("shift+tab from Logs: expected TabScrape")
	}
}

func TestLogEventMsg_ScrapingTrue(t *testing.T) {
	m := newTestModel()
	updated, _ := m.Update(LogEventMsg{Event: api.SSEEvent{Type: "status", IsScraping: true}})
	if !updated.(Model).scrape.isScraping {
		t.Errorf("expected isScraping=true after status event with IsScraping=true")
	}
}

func TestLogEventMsg_ScrapingFalse_TriggersRefresh(t *testing.T) {
	m := newTestModel()
	m.scrape.isScraping = true

	_, cmd := m.Update(LogEventMsg{Event: api.SSEEvent{Type: "status", IsScraping: false}})
	if cmd == nil {
		t.Errorf("expected non-nil cmd (results refresh) after scrape stop")
	}
}

func TestErrMsg_SetsError(t *testing.T) {
	m := newTestModel()
	updated, _ := m.Update(ErrMsg{Err: errTest("boom")})
	if updated.(Model).err != "boom" {
		t.Errorf("expected err='boom', got %q", updated.(Model).err)
	}
}

func TestStartScrapeMsg_SwitchesToLogs(t *testing.T) {
	m := newTestModel()
	updated, _ := m.Update(StartScrapeMsg{Keywords: "engineer", Location: "SF"})
	if updated.(Model).tab != TabLogs {
		t.Errorf("expected TabLogs after StartScrapeMsg")
	}
}

type errTest string

func (e errTest) Error() string { return string(e) }
