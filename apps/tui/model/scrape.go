package model

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/zytact/is-dl-tui/api"
	"github.com/zytact/is-dl-tui/ui"
)

type ScrapeModel struct {
	client api.APIClient
	width  int
	height int

	focusIndex int
	inputs     []textinput.Model

	viewport viewport.Model

	experienceOptions  []string
	experienceSelected map[int]bool
	experienceIndex    int

	jobTypeOptions  []string
	jobTypeSelected map[int]bool
	jobTypeIndex    int

	postedWithinOptions []string
	postedWithinIndex   int

	remoteOnly bool
	headless   bool
	isScraping bool

	inlineError string
}

const (
	scrapeKeywords = iota
	scrapeLocation
	scrapeLimit
	scrapeExperience
	scrapeJobType
	scrapePostedWithin
	scrapeRemoteOnly
	scrapeHeadless
	scrapeStartButton
)

func NewScrape(client api.APIClient) *ScrapeModel {
	inputs := make([]textinput.Model, 3)

	keywords := textinput.New()
	keywords.Placeholder = "e.g. Software Engineer Intern"
	keywords.Focus()

	location := textinput.New()
	location.Placeholder = "e.g. San Francisco, CA"

	limit := textinput.New()
	limit.Placeholder = "50"
	limit.SetValue("50")

	inputs[scrapeKeywords] = keywords
	inputs[scrapeLocation] = location
	inputs[scrapeLimit] = limit

	model := &ScrapeModel{
		client:              client,
		inputs:              inputs,
		experienceOptions:   []string{"Internship", "Entry level", "Associate", "Mid-Senior level", "Director"},
		experienceSelected:  map[int]bool{},
		experienceIndex:     0,
		jobTypeOptions:      []string{"Full-time", "Part-time"},
		jobTypeSelected:     map[int]bool{},
		jobTypeIndex:        0,
		postedWithinOptions: []string{"Any Time", "Past 24 hours", "Past week", "Past month"},
		postedWithinIndex:   0,
		headless:            true,
	}
	model.viewport = viewport.New(0, 0)
	return model
}

func (s *ScrapeModel) SetSize(width, height int) {
	s.width = width
	s.height = height

	innerH := height - 3 - 2
	if innerH < 1 {
		innerH = 1
	}
	innerW := width - 4
	if innerW < 1 {
		innerW = 1
	}
	s.viewport.Width = innerW
	s.viewport.Height = innerH
}

func (s *ScrapeModel) SetScraping(active bool) {
	s.isScraping = active
}

func (s *ScrapeModel) Update(msg tea.Msg) (*ScrapeModel, tea.Cmd) {
	s.inlineError = ""

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "tab", "shift+tab":
			if msg.String() == "tab" {
				s.focusIndex = (s.focusIndex + 1) % (scrapeStartButton + 1)
			} else {
				s.focusIndex = (s.focusIndex + scrapeStartButton) % (scrapeStartButton + 1)
			}
			s.updateFocus()
			return s, nil
		case "up":
			switch s.focusIndex {
			case scrapeExperience:
				if s.experienceIndex > 0 {
					s.experienceIndex--
					s.ensureFocusVisible()
					return s, nil
				}
				s.focusIndex = scrapeLimit
				s.updateFocus()
				return s, nil
			case scrapeJobType:
				if s.jobTypeIndex > 0 {
					s.jobTypeIndex--
					s.ensureFocusVisible()
					return s, nil
				}
				s.focusIndex = scrapeExperience
				s.updateFocus()
				return s, nil
			case scrapeKeywords:
				// already at top
				return s, nil
			default:
				s.focusIndex--
				s.updateFocus()
				return s, nil
			}
		case "down":
			switch s.focusIndex {
			case scrapeExperience:
				if s.experienceIndex < len(s.experienceOptions)-1 {
					s.experienceIndex++
					s.ensureFocusVisible()
					return s, nil
				}
				s.focusIndex = scrapeJobType
				s.updateFocus()
				return s, nil
			case scrapeJobType:
				if s.jobTypeIndex < len(s.jobTypeOptions)-1 {
					s.jobTypeIndex++
					s.ensureFocusVisible()
					return s, nil
				}
				s.focusIndex = scrapePostedWithin
				s.updateFocus()
				return s, nil
			case scrapeStartButton:
				// already at bottom
				return s, nil
			default:
				s.focusIndex++
				s.updateFocus()
				return s, nil
			}
		case "pgup", "pgdown":
			var cmd tea.Cmd
			s.viewport, cmd = s.viewport.Update(msg)
			return s, cmd
		case " ":
			if s.focusIndex == scrapeRemoteOnly {
				s.remoteOnly = !s.remoteOnly
				return s, nil
			}
			if s.focusIndex == scrapeHeadless {
				s.headless = !s.headless
				return s, nil
			}
			if s.focusIndex == scrapeExperience {
				s.toggleSelection(s.experienceSelected, s.experienceIndex)
				return s, nil
			}
			if s.focusIndex == scrapeJobType {
				s.toggleSelection(s.jobTypeSelected, s.jobTypeIndex)
				return s, nil
			}
		case "left":
			if s.focusIndex == scrapePostedWithin {
				s.postedWithinIndex = (s.postedWithinIndex + len(s.postedWithinOptions) - 1) % len(s.postedWithinOptions)
				return s, nil
			}
		case "right":
			if s.focusIndex == scrapePostedWithin {
				s.postedWithinIndex = (s.postedWithinIndex + 1) % len(s.postedWithinOptions)
				return s, nil
			}
		case "enter":
			if s.focusIndex == scrapeStartButton {
				if s.isScraping {
					return s, s.abortCmd()
				}
				return s, s.startCmd()
			}
		}
	}

	cmd := s.updateInputs(msg)
	return s, cmd
}

func (s *ScrapeModel) updateInputs(msg tea.Msg) tea.Cmd {
	var cmds []tea.Cmd
	for i := 0; i < len(s.inputs); i++ {
		if i == s.focusIndex {
			var cmd tea.Cmd
			s.inputs[i], cmd = s.inputs[i].Update(msg)
			if cmd != nil {
				cmds = append(cmds, cmd)
			}
		}
	}
	return tea.Batch(cmds...)
}

func (s *ScrapeModel) updateFocus() {
	for i := 0; i < len(s.inputs); i++ {
		if i == s.focusIndex {
			s.inputs[i].Focus()
		} else {
			s.inputs[i].Blur()
		}
	}
	s.ensureFocusVisible()
}

func (s *ScrapeModel) toggleSelection(store map[int]bool, index int) {
	if index < 0 {
		return
	}
	store[index] = !store[index]
}

func (s *ScrapeModel) startCmd() tea.Cmd {
	keywords := strings.TrimSpace(s.inputs[scrapeKeywords].Value())
	if keywords == "" {
		s.inlineError = "keywords are required"
		return nil
	}
	limitVal := strings.TrimSpace(s.inputs[scrapeLimit].Value())
	limit := 50
	if limitVal != "" {
		parsed, err := strconv.Atoi(limitVal)
		if err != nil || parsed < 1 {
			s.inlineError = "limit must be >= 1"
			return nil
		}
		limit = parsed
	}
	options := api.ScrapeOptions{
		Keywords:        keywords,
		Location:        strings.TrimSpace(s.inputs[scrapeLocation].Value()),
		Limit:           limit,
		ExperienceLevel: strings.Join(s.selectedOptions(s.experienceOptions, s.experienceSelected), ", "),
		JobType:         strings.Join(s.selectedOptions(s.jobTypeOptions, s.jobTypeSelected), ", "),
		RemoteOnly:      s.remoteOnly,
		Headless:        s.headless,
	}
	if s.postedWithinIndex > 0 {
		options.PostedWithin = s.postedWithinOptions[s.postedWithinIndex]
	}

	return func() tea.Msg {
		if err := s.client.StartScrape(options); err != nil {
			return ErrMsg{Err: err}
		}
		return StartScrapeMsg{Keywords: options.Keywords, Location: options.Location}
	}
}

func (s *ScrapeModel) abortCmd() tea.Cmd {
	return func() tea.Msg {
		if err := s.client.AbortScrape(); err != nil {
			return ErrMsg{Err: err}
		}
		return nil
	}
}

func (s *ScrapeModel) selectedOptions(options []string, selected map[int]bool) []string {
	out := []string{}
	for i, label := range options {
		if selected[i] {
			out = append(out, label)
		}
	}
	return out
}

func (s *ScrapeModel) View() string {
	var b strings.Builder
	b.WriteString(ui.PanelTitle.Render("SCRAPE"))
	b.WriteString("\n")

	b.WriteString(fieldRow("Keywords", s.inputs[scrapeKeywords].View(), s.focusIndex == scrapeKeywords))
	b.WriteString(fieldRow("Location", s.inputs[scrapeLocation].View(), s.focusIndex == scrapeLocation))
	b.WriteString(fieldRow("Limit", s.inputs[scrapeLimit].View(), s.focusIndex == scrapeLimit))
	b.WriteString("\n")

	b.WriteString(checkboxGroup("Experience Level", s.experienceOptions, s.experienceSelected, s.experienceIndex, s.focusIndex == scrapeExperience))
	b.WriteString(checkboxGroup("Job Type", s.jobTypeOptions, s.jobTypeSelected, s.jobTypeIndex, s.focusIndex == scrapeJobType))
	b.WriteString("\n")

	b.WriteString(cycleRow("Posted Within", s.postedWithinOptions[s.postedWithinIndex], s.focusIndex == scrapePostedWithin))
	b.WriteString(toggleRow("Remote Only", s.remoteOnly, s.focusIndex == scrapeRemoteOnly))
	b.WriteString(toggleRow("Headless", s.headless, s.focusIndex == scrapeHeadless))
	b.WriteString("\n")

	if s.inlineError != "" {
		b.WriteString(ui.ErrorText.Render(s.inlineError))
		b.WriteString("\n")
	}

	label := "[ START SCAN ]"
	btnStyle := ui.ButtonActive
	if s.isScraping {
		label = "[ ABORT ]"
		btnStyle = ui.ButtonAbort
	}
	if s.focusIndex == scrapeStartButton {
		b.WriteString(btnStyle.Render(label))
	} else {
		b.WriteString(ui.HelpText.Render(label))
	}

	content := b.String()
	s.viewport.SetContent(content)
	panelHeight := s.height - 3
	if panelHeight < 0 {
		panelHeight = 0
	}
	panelWidth := 55
	if panelWidth > s.width {
		panelWidth = s.width
	}
	s.viewport.Width = panelWidth - 4
	return ui.Panel.Width(panelWidth).Height(panelHeight).Render(s.viewport.View())
}

func (s *ScrapeModel) focusLine() int {
	line := 0
	line++
	line++
	keywordsLine := line
	line++
	locationLine := line
	line++
	limitLine := line
	line++
	line++
	line++
	experienceOptionStart := line
	line += len(s.experienceOptions)
	line++
	jobTypeOptionStart := line
	line += len(s.jobTypeOptions)
	line++
	postedWithinLine := line
	line++
	remoteOnlyLine := line
	line++
	headlessLine := line
	line++
	errorLine := -1
	if s.inlineError != "" {
		errorLine = line
		line++
	}
	buttonLine := line

	switch s.focusIndex {
	case scrapeKeywords:
		return keywordsLine
	case scrapeLocation:
		return locationLine
	case scrapeLimit:
		return limitLine
	case scrapeExperience:
		return experienceOptionStart + s.experienceIndex
	case scrapeJobType:
		return jobTypeOptionStart + s.jobTypeIndex
	case scrapePostedWithin:
		return postedWithinLine
	case scrapeRemoteOnly:
		return remoteOnlyLine
	case scrapeHeadless:
		return headlessLine
	case scrapeStartButton:
		return buttonLine
	default:
		return errorLine
	}
}

func (s *ScrapeModel) estimatedContentLines() int {
	line := 0
	line++
	line++
	line += 3
	line++
	line++
	line++
	line += len(s.experienceOptions)
	line++
	line += len(s.jobTypeOptions)
	line++
	line += 3
	line++
	if s.inlineError != "" {
		line++
	}
	line++
	return line
}

func (s *ScrapeModel) ensureFocusVisible() {
	if s.viewport.Height <= 0 {
		return
	}
	target := s.focusLine()
	if target < 0 {
		return
	}
	offset := s.viewport.YOffset
	if target < offset {
		offset = target
	} else if target >= offset+s.viewport.Height {
		offset = target - s.viewport.Height + 1
	}
	if offset < 0 {
		offset = 0
	}
	totalLines := s.estimatedContentLines()
	maxOffset := 0
	if totalLines > s.viewport.Height {
		maxOffset = totalLines - s.viewport.Height
	}
	if offset > maxOffset {
		offset = maxOffset
	}
	s.viewport.SetYOffset(offset)
}

func fieldRow(label, input string, focused bool) string {
	prefix := "  "
	if focused {
		prefix = "> "
	}
	return fmt.Sprintf("%s%s: %s\n", prefix, label, input)
}

func checkboxGroup(title string, options []string, selected map[int]bool, index int, focused bool) string {
	var b strings.Builder
	focusPrefix := "  "
	if focused {
		focusPrefix = "> "
	}
	fmt.Fprintf(&b, "%s%s:\n", focusPrefix, title)
	for i, label := range options {
		mark := "[ ]"
		if selected[i] {
			mark = "[x]"
		}
		cursor := "  "
		if focused && i == index {
			cursor = "> "
		}
		fmt.Fprintf(&b, " %s%s %s\n", cursor, mark, label)
	}
	return b.String()
}

func cycleRow(label, value string, focused bool) string {
	prefix := "  "
	if focused {
		prefix = "> "
	}
	return fmt.Sprintf("%s%s: %s (<-/->)\n", prefix, label, value)
}

func toggleRow(label string, on bool, focused bool) string {
	prefix := "  "
	if focused {
		prefix = "> "
	}
	state := "off"
	if on {
		state = "on"
	}
	return fmt.Sprintf("%s%s: %s (space)\n", prefix, label, state)
}
