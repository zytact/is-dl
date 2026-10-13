package model

import (
	"errors"
	"testing"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/zytact/is-dl-tui/api"
)

func newTestScrape(c api.APIClient) *ScrapeModel {
	return NewScrape(c)
}

func TestStartScrapeCmd_CallsClient(t *testing.T) {
	mc := &mockClient{}
	s := newTestScrape(mc)
	s.inputs[scrapeKeywords].SetValue("Go Engineer")
	s.inputs[scrapeLocation].SetValue("Remote")
	s.inputs[scrapeLimit].SetValue("10")

	cmd := s.startCmd()
	if cmd == nil {
		t.Fatal("expected non-nil cmd")
	}

	msg := cmd()
	if _, ok := msg.(StartScrapeMsg); !ok {
		t.Fatalf("expected StartScrapeMsg, got %T", msg)
	}
	if !mc.startScrapeCalled {
		t.Error("expected StartScrape to be called")
	}
	if mc.startScrapeOpts.Keywords != "Go Engineer" {
		t.Errorf("unexpected keywords: %q", mc.startScrapeOpts.Keywords)
	}
	if mc.startScrapeOpts.Limit != 10 {
		t.Errorf("unexpected limit: %d", mc.startScrapeOpts.Limit)
	}
}

func TestStartScrapeCmd_ClientError_ReturnsErrMsg(t *testing.T) {
	mc := &mockClient{startScrapeErr: errors.New("server down")}
	s := newTestScrape(mc)
	s.inputs[scrapeKeywords].SetValue("engineer")
	s.inputs[scrapeLocation].SetValue("NYC")

	cmd := s.startCmd()
	msg := cmd()
	errMsg, ok := msg.(ErrMsg)
	if !ok {
		t.Fatalf("expected ErrMsg, got %T", msg)
	}
	if errMsg.Err.Error() != "server down" {
		t.Errorf("unexpected error: %v", errMsg.Err)
	}
}

func TestAbortCmd_CallsClient(t *testing.T) {
	mc := &mockClient{}
	s := newTestScrape(mc)

	cmd := s.abortCmd()
	cmd()

	if !mc.abortScrapeCalled {
		t.Error("expected AbortScrape to be called")
	}
}

func TestAbortCmd_ClientError_ReturnsErrMsg(t *testing.T) {
	mc := &mockClient{abortScrapeErr: errors.New("abort failed")}
	s := newTestScrape(mc)

	msg := s.abortCmd()()
	errMsg, ok := msg.(ErrMsg)
	if !ok {
		t.Fatalf("expected ErrMsg, got %T", msg)
	}
	if errMsg.Err.Error() != "abort failed" {
		t.Errorf("unexpected error: %v", errMsg.Err)
	}
}

func TestStartScrapeCmd_EmptyKeywords_ReturnsNil(t *testing.T) {
	mc := &mockClient{}
	s := newTestScrape(mc)
	s.inputs[scrapeKeywords].SetValue("")

	cmd := s.startCmd()
	if cmd != nil {
		t.Error("expected nil cmd for empty keywords")
	}
}

func TestStartScrapeCmd_DefaultsToEverySource(t *testing.T) {
	mc := &mockClient{}
	s := newTestScrape(mc)
	s.inputs[scrapeKeywords].SetValue("Go Engineer")

	s.startCmd()()

	if mc.startScrapeOpts.Sources != "linkedin,unstop,ycombinator" {
		t.Errorf("unexpected sources: %q", mc.startScrapeOpts.Sources)
	}
	if mc.startScrapeOpts.UnstopOpportunity != "jobs" {
		t.Errorf("unexpected opportunity: %q", mc.startScrapeOpts.UnstopOpportunity)
	}
	if mc.startScrapeOpts.UnstopRoles != "software-development" {
		t.Errorf("unexpected roles: %q", mc.startScrapeOpts.UnstopRoles)
	}
	if mc.startScrapeOpts.YcombinatorRoles != "software-engineer" {
		t.Errorf("unexpected ycombinator roles: %q", mc.startScrapeOpts.YcombinatorRoles)
	}
	if mc.startScrapeOpts.YcombinatorMaxExperience != nil {
		t.Errorf("expected any experience, got %d", *mc.startScrapeOpts.YcombinatorMaxExperience)
	}
}

func TestStartScrapeCmd_LinkedInOnly_DropsUnstopFields(t *testing.T) {
	mc := &mockClient{}
	s := newTestScrape(mc)
	s.inputs[scrapeKeywords].SetValue("Go Engineer")
	s.sourceSelected[1] = false
	s.sourceSelected[2] = false

	s.startCmd()()

	if mc.startScrapeOpts.Sources != "linkedin" {
		t.Errorf("unexpected sources: %q", mc.startScrapeOpts.Sources)
	}
	if mc.startScrapeOpts.UnstopOpportunity != "" || mc.startScrapeOpts.UnstopRoles != "" {
		t.Errorf("expected no unstop fields, got %+v", mc.startScrapeOpts)
	}
	if mc.startScrapeOpts.YcombinatorRoles != "" {
		t.Errorf("expected no ycombinator fields, got %+v", mc.startScrapeOpts)
	}
}

func TestStartScrapeCmd_SendsYcombinatorFilters(t *testing.T) {
	mc := &mockClient{}
	s := newTestScrape(mc)
	s.inputs[scrapeKeywords].SetValue("Go Engineer")
	s.ycombinatorRoleSelected[1] = true
	s.ycombinatorExperienceIndex = 2
	s.toggles[scrapeYcombinatorSkipUsOnly] = true

	s.startCmd()()

	opts := mc.startScrapeOpts
	if opts.YcombinatorRoles != "software-engineer,designer" {
		t.Errorf("unexpected roles: %q", opts.YcombinatorRoles)
	}
	if opts.YcombinatorMaxExperience == nil || *opts.YcombinatorMaxExperience != 1 {
		t.Errorf("expected a 1 year ceiling, got %v", opts.YcombinatorMaxExperience)
	}
	if !opts.YcombinatorSkipUsOnly {
		t.Error("expected the US-only filter to be sent")
	}
}

func TestStartScrapeCmd_YcombinatorWithoutRole_ReturnsNil(t *testing.T) {
	mc := &mockClient{}
	s := newTestScrape(mc)
	s.inputs[scrapeKeywords].SetValue("Go Engineer")
	s.ycombinatorRoleSelected[0] = false

	if cmd := s.startCmd(); cmd != nil {
		t.Error("expected nil cmd when Y Combinator has no role")
	}
	if s.inlineError == "" || mc.startScrapeCalled {
		t.Errorf("expected an inline error and no request, got %q", s.inlineError)
	}
}

func TestStartScrapeCmd_NoSource_ReturnsNil(t *testing.T) {
	mc := &mockClient{}
	s := newTestScrape(mc)
	s.inputs[scrapeKeywords].SetValue("Go Engineer")
	s.sourceSelected[0] = false
	s.sourceSelected[1] = false
	s.sourceSelected[2] = false

	if cmd := s.startCmd(); cmd != nil {
		t.Error("expected nil cmd when no source is selected")
	}
	if s.inlineError == "" {
		t.Error("expected an inline error")
	}
	if mc.startScrapeCalled {
		t.Error("expected StartScrape not to be called")
	}
}

func TestVisibleFields_HidesUnstopFieldsWhenDeselected(t *testing.T) {
	s := newTestScrape(&mockClient{})

	if !containsField(s.visibleFields(), scrapeUnstopRoles) {
		t.Error("expected unstop roles to be visible by default")
	}

	s.sourceSelected[1] = false
	fields := s.visibleFields()
	if containsField(fields, scrapeUnstopRoles) || containsField(fields, scrapeUnstopOpportunity) {
		t.Errorf("expected no unstop fields, got %v", fields)
	}
}

func TestMoveFocus_SkipsHiddenUnstopFields(t *testing.T) {
	s := newTestScrape(&mockClient{})
	s.sourceSelected[1] = false
	s.sourceSelected[2] = false
	s.focusIndex = scrapeSources

	s.moveFocus(1, false)

	if s.focusIndex != scrapeExperience {
		t.Errorf("expected focus on experience, got %d", s.focusIndex)
	}
}

func containsField(fields []int, target int) bool {
	for _, field := range fields {
		if field == target {
			return true
		}
	}
	return false
}

func TestStartScrapeCmd_SendsToggles(t *testing.T) {
	mc := &mockClient{}
	s := newTestScrape(mc)
	s.inputs[scrapeKeywords].SetValue("engineer")
	s.focusIndex = scrapeExcludeSeen
	s.Update(tea.KeyMsg{Type: tea.KeySpace, Runes: []rune{' '}})

	s.startCmd()()

	if !mc.startScrapeOpts.ExcludeSeen || mc.startScrapeOpts.ExcludeApplied {
		t.Errorf("expected only ExcludeSeen, got %+v", mc.startScrapeOpts)
	}
	if !mc.startScrapeOpts.Headless {
		t.Error("expected Headless to stay on by default")
	}
}
