package model

import "github.com/arnab/is-dl-tui/api"

type mockClient struct {
	startScrapeErr  error
	abortScrapeErr  error
	listResultsOut  []api.ResultMeta
	listResultsErr  error
	getResultOut    *api.ResultFile
	getResultErr    error
	deleteResultErr error
	exportZIPOut    string
	exportZIPErr    error

	startScrapeCalled bool
	startScrapeOpts   api.ScrapeOptions
	abortScrapeCalled bool
}

func (m *mockClient) StartScrape(opts api.ScrapeOptions) error {
	m.startScrapeCalled = true
	m.startScrapeOpts = opts
	return m.startScrapeErr
}

func (m *mockClient) AbortScrape() error {
	m.abortScrapeCalled = true
	return m.abortScrapeErr
}

func (m *mockClient) ListResults() ([]api.ResultMeta, error) {
	return m.listResultsOut, m.listResultsErr
}

func (m *mockClient) GetResult(filename string) (*api.ResultFile, error) {
	return m.getResultOut, m.getResultErr
}

func (m *mockClient) DeleteResult(filename string) error {
	return m.deleteResultErr
}

func (m *mockClient) ExportZIP(destDir string) (string, error) {
	return m.exportZIPOut, m.exportZIPErr
}
