package model

import (
	"errors"
	"testing"

	"github.com/arnab/is-dl-tui/api"
)

func newTestResults(c api.APIClient) *ResultsModel {
	r := NewResults(c)
	r.SetSize(120, 40)
	return r
}

func TestResultsRefresh_PopulatesRows(t *testing.T) {
	mc := &mockClient{
		listResultsOut: []api.ResultMeta{
			{Filename: "a.json", Meta: api.SearchMeta{Query: "engineer", Location: "NYC"}, Count: 5},
			{Filename: "b.json", Meta: api.SearchMeta{Query: "designer", Location: "SF"}, Count: 3},
		},
	}
	r := newTestResults(mc)

	cmd := r.refreshCmd()
	msg := cmd()

	listMsg, ok := msg.(resultsListMsg)
	if !ok {
		t.Fatalf("expected resultsListMsg, got %T", msg)
	}
	if len(listMsg.rows) != 2 {
		t.Errorf("expected 2 results, got %d", len(listMsg.rows))
	}
	if listMsg.rows[0].Filename != "a.json" {
		t.Errorf("unexpected first filename: %q", listMsg.rows[0].Filename)
	}
}

func TestResultsRefresh_Error(t *testing.T) {
	mc := &mockClient{listResultsErr: errors.New("network error")}
	r := newTestResults(mc)

	cmd := r.refreshCmd()
	msg := cmd()

	errMsg, ok := msg.(resultsErrMsg)
	if !ok {
		t.Fatalf("expected resultsErrMsg, got %T", msg)
	}
	if errMsg.err.Error() != "network error" {
		t.Errorf("unexpected error: %v", errMsg.err)
	}
}

func TestResultsListMsg_UpdatesTable(t *testing.T) {
	mc := &mockClient{
		listResultsOut: []api.ResultMeta{
			{Filename: "x.json", Meta: api.SearchMeta{Query: "dev", Location: "London"}, Count: 1},
		},
	}
	r := newTestResults(mc)

	r, _ = r.Update(resultsListMsg{rows: mc.listResultsOut})
	if len(r.rows) != 1 {
		t.Errorf("expected 1 row, got %d", len(r.rows))
	}
	if r.rows[0].Filename != "x.json" {
		t.Errorf("unexpected filename: %q", r.rows[0].Filename)
	}
}

func TestResultsDeleteCmd_CallsClient(t *testing.T) {
	mc := &mockClient{}
	r := newTestResults(mc)
	r.rows = []api.ResultMeta{{Filename: "del.json"}}

	cmd := r.deleteFilenameCmd("del.json")
	msg := cmd()

	if _, ok := msg.(resultDeletedMsg); !ok {
		t.Fatalf("expected resultDeletedMsg, got %T", msg)
	}
}

func TestResultsDeleteCmd_ClientError(t *testing.T) {
	mc := &mockClient{deleteResultErr: errors.New("delete failed")}
	r := newTestResults(mc)

	cmd := r.deleteFilenameCmd("del.json")
	msg := cmd()

	errMsg, ok := msg.(resultsErrMsg)
	if !ok {
		t.Fatalf("expected resultsErrMsg, got %T", msg)
	}
	if errMsg.err.Error() != "delete failed" {
		t.Errorf("unexpected error: %v", errMsg.err)
	}
}
