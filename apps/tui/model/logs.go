package model

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/arnab/is-dl-tui/api"
	"github.com/arnab/is-dl-tui/ui"
)

type LogsModel struct {
	width          int
	height         int
	viewport       viewport.Model
	statusScraping bool
	lastKeywords   string
	content        string
}

func NewLogs() *LogsModel {
	vp := viewport.New(0, 0)
	vp.YPosition = 0
	return &LogsModel{
		viewport: vp,
	}
}

func (l *LogsModel) SetSize(width, height int) {
	l.width = width
	l.height = height
	l.viewport.Width = maxInt(0, width-4)
	l.viewport.Height = maxInt(0, height-8)
}

func (l *LogsModel) SetContext(keywords, location string) {
	if location != "" {
		l.lastKeywords = fmt.Sprintf("%s @ %s", keywords, location)
	} else {
		l.lastKeywords = keywords
	}
}

func (l *LogsModel) ApplyEvent(evt api.SSEEvent) {
	switch evt.Type {
	case "status":
		l.statusScraping = evt.IsScraping
	case "log":
		if l.content == "" {
			l.content = evt.Message
		} else {
			l.content = l.content + "\n" + evt.Message
		}
		l.viewport.SetContent(l.content)
		l.viewport.GotoBottom()
	}
}

func (l *LogsModel) Update(msg tea.Msg) (*LogsModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "c":
			l.content = ""
			l.viewport.SetContent("")
			return l, nil
		case "G":
			l.viewport.GotoBottom()
			return l, nil
		}
	}
	var cmd tea.Cmd
	l.viewport, cmd = l.viewport.Update(msg)
	return l, cmd
}

func (l *LogsModel) View() string {
	statusText := "IDLE"
	statusStyle := ui.StatusIdle
	if l.statusScraping {
		statusText = "ACTIVE SCAN"
		statusStyle = ui.StatusActive
	}
	statusLine := statusStyle.Render("* " + statusText)
	if strings.TrimSpace(l.lastKeywords) != "" {
		statusLine = statusLine + "  " + ui.HelpText.Render(l.lastKeywords)
	}

	statusPanel := ui.Panel.Render(ui.PanelTitle.Render("STATUS") + "\n" + statusLine)
	consolePanel := ui.Panel.Render(ui.PanelTitle.Render("CONSOLE") + "\n" + l.viewport.View())

	return lipgloss.JoinVertical(lipgloss.Left, statusPanel, consolePanel)
}
