package ui

import (
	"github.com/charmbracelet/bubbles/table"
	"github.com/charmbracelet/lipgloss"
)

var (
	ColorBg      = lipgloss.Color("#0d0d0d")
	ColorCyan    = lipgloss.Color("#00ffff")
	ColorMagenta = lipgloss.Color("#ff00ff")
	ColorText    = lipgloss.Color("#cccccc")
	ColorError   = lipgloss.Color("#ff4444")
	ColorDim     = lipgloss.Color("#666666")
)

var (
	BaseStyle  = lipgloss.NewStyle().Foreground(ColorText).Background(ColorBg)
	Panel      = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(ColorCyan).Padding(0, 1)
	PanelTitle = lipgloss.NewStyle().Foreground(ColorCyan).Bold(true)

	TabActive   = lipgloss.NewStyle().Foreground(ColorCyan).Bold(true).Underline(true)
	TabInactive = lipgloss.NewStyle().Foreground(ColorDim)

	StatusActive = lipgloss.NewStyle().Foreground(ColorMagenta).Bold(true)
	StatusIdle   = lipgloss.NewStyle().Foreground(ColorDim)
	ErrorText    = lipgloss.NewStyle().Foreground(ColorError)
	SuccessText  = lipgloss.NewStyle().Foreground(ColorCyan)
	WarningText  = lipgloss.NewStyle().Foreground(ColorMagenta).Bold(true)
	MutedText    = lipgloss.NewStyle().Foreground(ColorDim)
	MetaText     = lipgloss.NewStyle().Foreground(ColorDim)

	ButtonActive = lipgloss.NewStyle().Foreground(ColorCyan).Bold(true)
	ButtonAbort  = lipgloss.NewStyle().Foreground(ColorMagenta).Bold(true)

	HelpText = lipgloss.NewStyle().Foreground(ColorDim)
)

func TableStyles() table.Styles {
	styles := table.DefaultStyles()
	styles.Header = styles.Header.
		BorderStyle(lipgloss.NormalBorder()).
		BorderBottom(true).
		BorderForeground(ColorCyan).
		Foreground(ColorCyan).
		Bold(true)
	styles.Selected = styles.Selected.Foreground(ColorMagenta).Bold(true)
	return styles
}
