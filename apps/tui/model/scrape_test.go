package model

import (
	"errors"
	"testing"

	"github.com/arnab/is-dl-tui/api"
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
