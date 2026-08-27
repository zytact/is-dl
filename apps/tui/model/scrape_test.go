package model

import (
	"errors"
	"testing"

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

	if mc.startScrapeOpts.Sources != "linkedin,unstop" {
		t.Errorf("unexpected sources: %q", mc.startScrapeOpts.Sources)
	}
	if mc.startScrapeOpts.UnstopOpportunity != "jobs" {
		t.Errorf("unexpected opportunity: %q", mc.startScrapeOpts.UnstopOpportunity)
	}
	if mc.startScrapeOpts.UnstopRoles != "software-development" {
		t.Errorf("unexpected roles: %q", mc.startScrapeOpts.UnstopRoles)
	}
}

func TestStartScrapeCmd_LinkedInOnly_DropsUnstopFields(t *testing.T) {
	mc := &mockClient{}
	s := newTestScrape(mc)
	s.inputs[scrapeKeywords].SetValue("Go Engineer")
	s.sourceSelected[1] = false

	s.startCmd()()

	if mc.startScrapeOpts.Sources != "linkedin" {
		t.Errorf("unexpected sources: %q", mc.startScrapeOpts.Sources)
	}
	if mc.startScrapeOpts.UnstopOpportunity != "" || mc.startScrapeOpts.UnstopRoles != "" {
		t.Errorf("expected no unstop fields, got %+v", mc.startScrapeOpts)
	}
}

func TestStartScrapeCmd_NoSource_ReturnsNil(t *testing.T) {
	mc := &mockClient{}
	s := newTestScrape(mc)
	s.inputs[scrapeKeywords].SetValue("Go Engineer")
	s.sourceSelected[0] = false
	s.sourceSelected[1] = false

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
