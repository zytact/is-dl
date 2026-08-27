package model

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/zytact/is-dl-tui/api"
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

func sourcedResult() *api.ResultFile {
	return &api.ResultFile{
		Meta: api.SearchMeta{
			Query:  "engineer",
			Source: "unstop",
			Sources: []api.SourceRun{
				{Source: "linkedin", Status: "failed", Count: 0, Error: "no stored session"},
				{Source: "unstop", Status: "ok", Count: 2},
			},
		},
		Jobs: []api.JobListing{
			{Source: "unstop", JobURL: "https://unstop.test/1"},
			{Source: "unstop", JobURL: "https://unstop.test/2"},
		},
	}
}

func TestResultDetail_AppliesSourceFilter(t *testing.T) {
	r := newTestResults(&mockClient{})
	result := sourcedResult()
	result.Jobs = append(result.Jobs, api.JobListing{Source: "linkedin", JobURL: "https://li.test/1"})

	r, _ = r.Update(resultDetailMsg{filename: "a.json", result: result})
	if len(r.visibleJobs) != 3 {
		t.Fatalf("expected every job visible, got %d", len(r.visibleJobs))
	}

	r.cycleSourceFilter()
	if r.sourceFilter != "unstop" || len(r.visibleJobs) != 2 {
		t.Errorf("expected 2 unstop jobs, got filter %q with %d", r.sourceFilter, len(r.visibleJobs))
	}

	r.cycleSourceFilter()
	if r.sourceFilter != "linkedin" || len(r.visibleJobs) != 1 {
		t.Errorf("expected 1 linkedin job, got filter %q with %d", r.sourceFilter, len(r.visibleJobs))
	}

	r.cycleSourceFilter()
	if r.sourceFilter != "" || len(r.visibleJobs) != 3 {
		t.Errorf("expected the filter to wrap back to every source, got %q", r.sourceFilter)
	}
}

func TestCycleSourceFilter_SingleSourceStaysUnfiltered(t *testing.T) {
	r := newTestResults(&mockClient{})
	r, _ = r.Update(resultDetailMsg{filename: "a.json", result: sourcedResult()})

	r.cycleSourceFilter()

	if r.sourceFilter != "" {
		t.Errorf("expected no filter with one source, got %q", r.sourceFilter)
	}
}

func TestFormatSourceRuns_ShowsSkippedSource(t *testing.T) {
	meta := sourcedResult().Meta

	if got := formatSourceRuns(meta); got != "linkedin skipped  unstop 2" {
		t.Errorf("unexpected summary: %q", got)
	}
	if got := skippedSources(meta); got != "linkedin: no stored session" {
		t.Errorf("unexpected skip detail: %q", got)
	}
}

func TestFormatSourceRuns_FallsBackToLegacyMeta(t *testing.T) {
	meta := api.SearchMeta{Source: "linkedin"}

	if got := formatSourceRuns(meta); got != "linkedin" {
		t.Errorf("unexpected summary: %q", got)
	}
	if got := skippedSources(meta); got != "" {
		t.Errorf("expected no skips, got %q", got)
	}
}

func TestSearchMeta_DecodesRunFileWithoutSources(t *testing.T) {
	var meta api.SearchMeta
	if err := json.Unmarshal([]byte(`{"query":"dev","source":"linkedin","count":3}`), &meta); err != nil {
		t.Fatalf("expected a legacy run file to decode, got %v", err)
	}
	if meta.Sources != nil {
		t.Errorf("expected no source runs, got %v", meta.Sources)
	}
}

func TestFormatPay_OnlyShowsPublishedFigures(t *testing.T) {
	min := 20000.0
	max := 40000.0

	if got := formatPay(nil); got != "-" {
		t.Errorf("unexpected pay for a missing block: %q", got)
	}
	if got := formatPay(&api.PayInfo{Kind: "unstated"}); got != "unstated" {
		t.Errorf("unexpected pay without figures: %q", got)
	}
	pay := &api.PayInfo{Kind: "paid", Amount: &api.PayAmount{Min: &min, Max: &max, Currency: "INR", Period: "monthly"}}
	if got := formatPay(pay); got != "paid: INR 20000 - 40000 / monthly" {
		t.Errorf("unexpected pay range: %q", got)
	}
	single := &api.PayInfo{Kind: "paid", Amount: &api.PayAmount{Min: &min, Max: &min, Currency: "INR", Period: "unknown"}}
	if got := formatPay(single); got != "paid: INR 20000" {
		t.Errorf("unexpected single figure: %q", got)
	}
}
