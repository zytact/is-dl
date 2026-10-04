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

	sourceOptions  []string
	sourceSelected map[int]bool
	sourceIndex    int

	unstopOpportunityOptions []string
	unstopOpportunityIndex   int

	unstopRoleOptions  []string
	unstopRoleSelected map[int]bool
	unstopRoleIndex    int

	experienceOptions  []string
	experienceSelected map[int]bool
	experienceIndex    int

	jobTypeOptions  []string
	jobTypeSelected map[int]bool
	jobTypeIndex    int

	postedWithinOptions []string
	postedWithinIndex   int

	// On or off per toggle field, keyed by its field id.
	toggles    map[int]bool
	isScraping bool

	inlineError string

	// Line positions from the last render, used to keep the focused field visible.
	fieldLines   map[int]int
	contentLines int
}

const (
	scrapeKeywords = iota
	scrapeLocation
	scrapeLimit
	scrapeSources
	scrapeUnstopOpportunity
	scrapeUnstopRoles
	scrapeExperience
	scrapeJobType
	scrapePostedWithin
	scrapeRemoteOnly
	scrapeHeadless
	scrapeExcludeSeen
	scrapeExcludeApplied
	scrapeExcludeUnpaid
	scrapeStartButton
)

var toggleLabels = []struct {
	field int
	label string
}{
	{scrapeRemoteOnly, "Remote Only"},
	{scrapeHeadless, "Headless"},
	{scrapeExcludeSeen, "Skip Seen"},
	{scrapeExcludeApplied, "Skip Applied"},
	{scrapeExcludeUnpaid, "Skip Unpaid"},
}

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
		client:                   client,
		inputs:                   inputs,
		sourceOptions:            []string{"linkedin", "unstop"},
		sourceSelected:           map[int]bool{0: true, 1: true},
		unstopOpportunityOptions: []string{"jobs", "internships", "hackathons", "competitions"},
		unstopRoleOptions: []string{
			"software-development",
			"frontend-development",
			"full-stack-development",
			"backend-development",
		},
		unstopRoleSelected:  map[int]bool{0: true},
		experienceOptions:   []string{"Internship", "Entry level", "Associate", "Mid-Senior level", "Director"},
		experienceSelected:  map[int]bool{},
		jobTypeOptions:      []string{"Full-time", "Part-time"},
		jobTypeSelected:     map[int]bool{},
		postedWithinOptions: []string{"Any Time", "Past 24 hours", "Past week", "Past month"},
		toggles:             map[int]bool{scrapeHeadless: true},
		fieldLines:          map[int]int{},
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

// A group of checkboxes, addressed uniformly so navigation stays in one place.
type checkboxField struct {
	options  []string
	selected map[int]bool
	index    *int
}

func (s *ScrapeModel) checkboxField(field int) *checkboxField {
	switch field {
	case scrapeSources:
		return &checkboxField{s.sourceOptions, s.sourceSelected, &s.sourceIndex}
	case scrapeUnstopRoles:
		return &checkboxField{s.unstopRoleOptions, s.unstopRoleSelected, &s.unstopRoleIndex}
	case scrapeExperience:
		return &checkboxField{s.experienceOptions, s.experienceSelected, &s.experienceIndex}
	case scrapeJobType:
		return &checkboxField{s.jobTypeOptions, s.jobTypeSelected, &s.jobTypeIndex}
	}
	return nil
}

func (s *ScrapeModel) cycleField(field int) (options []string, index *int) {
	switch field {
	case scrapeUnstopOpportunity:
		return s.unstopOpportunityOptions, &s.unstopOpportunityIndex
	case scrapePostedWithin:
		return s.postedWithinOptions, &s.postedWithinIndex
	}
	return nil, nil
}

func (s *ScrapeModel) unstopEnabled() bool {
	for i, name := range s.sourceOptions {
		if name == "unstop" && s.sourceSelected[i] {
			return true
		}
	}
	return false
}

// The Unstop fields only exist while Unstop is one of the selected sources.
func (s *ScrapeModel) visibleFields() []int {
	fields := []int{scrapeKeywords, scrapeLocation, scrapeLimit, scrapeSources}
	if s.unstopEnabled() {
		fields = append(fields, scrapeUnstopOpportunity, scrapeUnstopRoles)
	}
	return append(fields,
		scrapeExperience,
		scrapeJobType,
		scrapePostedWithin,
		scrapeRemoteOnly,
		scrapeHeadless,
		scrapeExcludeSeen,
		scrapeExcludeApplied,
		scrapeExcludeUnpaid,
		scrapeStartButton,
	)
}

func (s *ScrapeModel) moveFocus(delta int, wrap bool) {
	fields := s.visibleFields()
	current := 0
	for i, field := range fields {
		if field == s.focusIndex {
			current = i
		}
	}
	next := current + delta
	if wrap {
		next = (next + len(fields)) % len(fields)
	} else if next < 0 || next >= len(fields) {
		return
	}
	s.focusIndex = fields[next]
	s.updateFocus()
}

func (s *ScrapeModel) Update(msg tea.Msg) (*ScrapeModel, tea.Cmd) {
	s.inlineError = ""

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "tab":
			s.moveFocus(1, true)
			return s, nil
		case "shift+tab":
			s.moveFocus(-1, true)
			return s, nil
		case "up":
			if group := s.checkboxField(s.focusIndex); group != nil && *group.index > 0 {
				*group.index--
				s.ensureFocusVisible()
				return s, nil
			}
			s.moveFocus(-1, false)
			return s, nil
		case "down":
			if group := s.checkboxField(s.focusIndex); group != nil && *group.index < len(group.options)-1 {
				*group.index++
				s.ensureFocusVisible()
				return s, nil
			}
			s.moveFocus(1, false)
			return s, nil
		case "pgup", "pgdown":
			var cmd tea.Cmd
			s.viewport, cmd = s.viewport.Update(msg)
			return s, cmd
		case " ":
			for _, t := range toggleLabels {
				if s.focusIndex == t.field {
					s.toggles[t.field] = !s.toggles[t.field]
					return s, nil
				}
			}
			if group := s.checkboxField(s.focusIndex); group != nil {
				group.selected[*group.index] = !group.selected[*group.index]
				return s, nil
			}
		case "left", "right":
			options, index := s.cycleField(s.focusIndex)
			if options != nil {
				delta := 1
				if msg.String() == "left" {
					delta = len(options) - 1
				}
				*index = (*index + delta) % len(options)
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

func (s *ScrapeModel) startCmd() tea.Cmd {
	keywords := strings.TrimSpace(s.inputs[scrapeKeywords].Value())
	if keywords == "" {
		s.inlineError = "keywords are required"
		return nil
	}
	sources := s.selectedOptions(s.sourceOptions, s.sourceSelected)
	if len(sources) == 0 {
		s.inlineError = "select at least one source"
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
		RemoteOnly:      s.toggles[scrapeRemoteOnly],
		Headless:        s.toggles[scrapeHeadless],
		ExcludeSeen:     s.toggles[scrapeExcludeSeen],
		ExcludeApplied:  s.toggles[scrapeExcludeApplied],
		ExcludeUnpaid:   s.toggles[scrapeExcludeUnpaid],
		Sources:         strings.Join(sources, ","),
	}
	if s.unstopEnabled() {
		options.UnstopOpportunity = s.unstopOpportunityOptions[s.unstopOpportunityIndex]
		options.UnstopRoles = strings.Join(s.selectedOptions(s.unstopRoleOptions, s.unstopRoleSelected), ",")
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

// Accumulates the form and records where each field landed, so the viewport can
// scroll to the focused one without a second copy of the layout arithmetic.
type formBuilder struct {
	b     strings.Builder
	lines int
	at    map[int]int
}

func (f *formBuilder) write(text string) {
	f.b.WriteString(text)
	f.lines += strings.Count(text, "\n")
}

func (f *formBuilder) field(id int, text string) {
	f.at[id] = f.lines
	f.write(text)
}

func (f *formBuilder) group(id int, cursor int, text string) {
	f.at[id] = f.lines + 1 + cursor // the title takes the first line
	f.write(text)
}

func (s *ScrapeModel) View() string {
	f := &formBuilder{at: map[int]int{}}
	f.write(ui.PanelTitle.Render("SCRAPE") + "\n\n")

	f.field(scrapeKeywords, fieldRow("Keywords", s.inputs[scrapeKeywords].View(), s.focusIndex == scrapeKeywords))
	f.field(scrapeLocation, fieldRow("Location", s.inputs[scrapeLocation].View(), s.focusIndex == scrapeLocation))
	f.field(scrapeLimit, fieldRow("Limit", s.inputs[scrapeLimit].View(), s.focusIndex == scrapeLimit))
	f.write("\n")

	f.group(scrapeSources, s.sourceIndex,
		checkboxGroup("Sources", s.sourceOptions, s.sourceSelected, s.sourceIndex, s.focusIndex == scrapeSources))
	if s.unstopEnabled() {
		f.field(scrapeUnstopOpportunity,
			cycleRow("Unstop Opportunity", s.unstopOpportunityOptions[s.unstopOpportunityIndex], s.focusIndex == scrapeUnstopOpportunity))
		f.group(scrapeUnstopRoles, s.unstopRoleIndex,
			checkboxGroup("Unstop Roles", s.unstopRoleOptions, s.unstopRoleSelected, s.unstopRoleIndex, s.focusIndex == scrapeUnstopRoles))
	}
	f.write("\n")

	f.group(scrapeExperience, s.experienceIndex,
		checkboxGroup("Experience Level", s.experienceOptions, s.experienceSelected, s.experienceIndex, s.focusIndex == scrapeExperience))
	f.group(scrapeJobType, s.jobTypeIndex,
		checkboxGroup("Job Type", s.jobTypeOptions, s.jobTypeSelected, s.jobTypeIndex, s.focusIndex == scrapeJobType))
	f.write("\n")

	f.field(scrapePostedWithin, cycleRow("Posted Within", s.postedWithinOptions[s.postedWithinIndex], s.focusIndex == scrapePostedWithin))
	for _, t := range toggleLabels {
		f.field(t.field, toggleRow(t.label, s.toggles[t.field], s.focusIndex == t.field))
	}
	f.write("\n")

	if s.inlineError != "" {
		f.write(ui.ErrorText.Render(s.inlineError) + "\n")
	}

	label := "[ START SCAN ]"
	btnStyle := ui.ButtonActive
	if s.isScraping {
		label = "[ ABORT ]"
		btnStyle = ui.ButtonAbort
	}
	f.at[scrapeStartButton] = f.lines
	if s.focusIndex == scrapeStartButton {
		f.write(btnStyle.Render(label))
	} else {
		f.write(ui.HelpText.Render(label))
	}

	s.fieldLines = f.at
	s.contentLines = f.lines + 1

	s.viewport.SetContent(f.b.String())
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

func (s *ScrapeModel) ensureFocusVisible() {
	if s.viewport.Height <= 0 {
		return
	}
	target, ok := s.fieldLines[s.focusIndex]
	if !ok {
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
	maxOffset := 0
	if s.contentLines > s.viewport.Height {
		maxOffset = s.contentLines - s.viewport.Height
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
