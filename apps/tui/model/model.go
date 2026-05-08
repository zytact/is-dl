package model

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/zytact/is-dl-tui/api"
	"github.com/zytact/is-dl-tui/ui"
)

type Tab int

const (
	TabScrape Tab = iota
	TabLogs
	TabResults
)

type LogEventMsg struct {
	Event api.SSEEvent
}

type StartScrapeMsg struct {
	Keywords string
	Location string
}

type ErrMsg struct {
	Err error
}

type Model struct {
	client api.APIClient
	width  int
	height int

	tab Tab

	scrape  *ScrapeModel
	logs    *LogsModel
	results *ResultsModel

	err string
}

func New(client api.APIClient) Model {
	return Model{
		client:  client,
		tab:     TabScrape,
		scrape:  NewScrape(client),
		logs:    NewLogs(),
		results: NewResults(client),
	}
}

func (m Model) Init() tea.Cmd {
	return m.results.Refresh()
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.scrape.SetSize(msg.Width, msg.Height)
		m.logs.SetSize(msg.Width, msg.Height)
		m.results.SetSize(msg.Width, msg.Height)
		return m, nil
	case tea.KeyMsg:
		if msg.Type == tea.KeyCtrlC || msg.String() == "q" {
			return m, tea.Quit
		}
		if msg.String() == "tab" {
			m.tab = (m.tab + 1) % 3
			return m, m.refreshResultsIfNeeded()
		}
		if msg.String() == "shift+tab" {
			m.tab = (m.tab + 2) % 3
			return m, m.refreshResultsIfNeeded()
		}
		if msg.String() == "1" || msg.String() == "2" || msg.String() == "3" {
			m.tab = Tab(msg.String()[0] - '1')
			return m, m.refreshResultsIfNeeded()
		}
	case LogEventMsg:
		m.logs.ApplyEvent(msg.Event)
		if msg.Event.Type == "status" && msg.Event.IsScraping {
			m.scrape.SetScraping(true)
		}
		if msg.Event.Type == "status" && !msg.Event.IsScraping {
			m.scrape.SetScraping(false)
			return m, m.results.Refresh()
		}
		return m, nil
	case StartScrapeMsg:
		m.logs.SetContext(msg.Keywords, msg.Location)
		m.tab = TabLogs
		return m, nil
	case ErrMsg:
		m.err = msg.Err.Error()
		return m, nil
	}

	var cmd tea.Cmd
	switch m.tab {
	case TabScrape:
		m.scrape, cmd = m.scrape.Update(msg)
	case TabLogs:
		m.logs, cmd = m.logs.Update(msg)
	case TabResults:
		m.results, cmd = m.results.Update(msg)
	}

	return m, cmd
}

func (m *Model) refreshResultsIfNeeded() tea.Cmd {
	if m.tab != TabResults {
		return nil
	}
	return m.results.Refresh()
}

func (m Model) View() string {
	tabs := []string{
		ui.TabInactive.Render("1: SCRAPE"),
		ui.TabInactive.Render("2: LOGS"),
		ui.TabInactive.Render("3: RESULTS"),
	}
	switch m.tab {
	case TabScrape:
		tabs[0] = ui.TabActive.Render("1: SCRAPE")
	case TabLogs:
		tabs[1] = ui.TabActive.Render("2: LOGS")
	case TabResults:
		tabs[2] = ui.TabActive.Render("3: RESULTS")
	}
	header := fmt.Sprintf("[ %s ]  [ %s ]  [ %s ]%s%s",
		tabs[0], tabs[1], tabs[2], strings.Repeat(" ", 6), ui.HelpText.Render("q: quit"))

	var body string
	switch m.tab {
	case TabScrape:
		body = m.scrape.View()
	case TabLogs:
		body = m.logs.View()
	case TabResults:
		body = m.results.View()
	}

	if m.err != "" {
		body = body + "\n" + ui.ErrorText.Render(m.err)
	}
	frame := lipgloss.NewStyle().Background(ui.ColorBg).Foreground(ui.ColorText)
	layout := header + "\n" + body
	return frame.Width(m.width).Height(m.height).Render(layout)
}
