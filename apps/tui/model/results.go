package model

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/table"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/zytact/is-dl-tui/api"
	"github.com/zytact/is-dl-tui/ui"
)

type ResultsModel struct {
	client api.APIClient
	width  int
	height int

	table table.Model
	rows  []api.ResultMeta

	inDetail       bool
	detailResult   *api.ResultFile
	detailTable    table.Model
	detailViewport viewport.Model
	detailFilename string

	inJobDetail       bool
	jobDetailViewport viewport.Model

	loading               bool
	loaded                bool
	deletingFilename      string
	confirmDeleteFilename string
	deleteCursor          int
	selectedJobIndex      int
	detailConfirmDelete   bool

	lastExportPath string
	lastError      string
}

func NewResults(client api.APIClient) *ResultsModel {
	t := table.New(
		table.WithColumns([]table.Column{
			{Title: "ID", Width: 4},
			{Title: "Query", Width: 24},
			{Title: "Jobs", Width: 5},
			{Title: "Location", Width: 12},
			{Title: "Scraped", Width: 12},
			{Title: "Filename", Width: 20},
		}),
		table.WithFocused(true),
	)
	t.SetStyles(ui.TableStyles())
	dv := viewport.New(0, 0)
	dv.SetContent("Select a job to inspect details.")
	return &ResultsModel{
		client:         client,
		table:          t,
		detailViewport: dv,
		loading:        false,
		loaded:         false,
		deleteCursor:   -1,
	}
}

func (r *ResultsModel) Refresh() tea.Cmd {
	return tea.Batch(r.loadingCmd(), r.refreshCmd())
}

func (r *ResultsModel) SetSize(width, height int) {
	r.width = width
	r.height = height
	innerW := r.innerWidth()
	innerH := r.innerHeight()
	r.table.SetHeight(maxInt(innerH-3, 1)) // header (2) + footer (1)
	r.table.SetColumns(buildListColumns(innerW))
	if r.inDetail {
		jobsH := maxInt((innerH-6)/2, 2)
		descH := maxInt(innerH-6-jobsH, 2)
		r.detailTable.SetHeight(jobsH)
		r.detailViewport.Width = innerW
		r.detailViewport.Height = descH
		r.detailTable.SetColumns(buildDetailColumns(innerW))
	}
	if r.inJobDetail {
		r.jobDetailViewport.Width = innerW
		r.jobDetailViewport.Height = maxInt(innerH-4, 2)
		r.jobDetailViewport.SetContent(buildFullJobDetail(r.detailResult, r.selectedJobIndex, innerW))
	}
}

func (r *ResultsModel) Update(msg tea.Msg) (*ResultsModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if !r.loading {
			r.lastError = ""
			r.lastExportPath = ""
		}
		switch msg.String() {
		case "r":
			return r, tea.Batch(r.loadingCmd(), r.refreshCmd())
		case "d":
			if r.inDetail {
				if r.detailFilename != "" {
					r.detailConfirmDelete = true
				}
				return r, nil
			}
			filename := r.currentListFilename()
			if filename != "" {
				r.confirmDeleteFilename = filename
			}
			return r, nil
		case "y":
			if r.detailConfirmDelete {
				filename := r.detailFilename
				r.detailConfirmDelete = false
				r.deletingFilename = filename
				r.deleteCursor = r.table.Cursor()
				return r, r.deleteFilenameCmd(filename)
			}
			if r.confirmDeleteFilename != "" {
				filename := r.confirmDeleteFilename
				r.confirmDeleteFilename = ""
				r.deletingFilename = filename
				r.deleteCursor = r.table.Cursor()
				return r, r.deleteFilenameCmd(filename)
			}
		case "n", "esc", "b":
			if r.detailConfirmDelete {
				r.detailConfirmDelete = false
				return r, nil
			}
			if r.confirmDeleteFilename != "" {
				r.confirmDeleteFilename = ""
				return r, nil
			}
			if r.inJobDetail {
				r.inJobDetail = false
				r.detailTable.SetCursor(r.selectedJobIndex)
				return r, nil
			}
			if r.inDetail {
				r.inDetail = false
				r.detailResult = nil
				return r, nil
			}
		case "x":
			if !r.inDetail {
				return r, r.exportCmd()
			}
		case "enter":
			if r.inJobDetail {
				return r, nil
			}
			if r.inDetail {
				return r, r.openJobDetailCmd()
			}
			if r.confirmDeleteFilename != "" {
				return r, nil
			}
			return r, r.openDetailCmd()
		case "o":
			if r.inJobDetail {
				return r, r.openURLFromJobDetail()
			}
			if r.inDetail {
				return r, r.openURLCmd()
			}
		case "up", "down":
			if r.inJobDetail {
				var cmd tea.Cmd
				r.jobDetailViewport, cmd = r.jobDetailViewport.Update(msg)
				return r, cmd
			}
			if r.inDetail {
				var cmd tea.Cmd
				r.detailTable, cmd = r.detailTable.Update(msg)
				r.selectedJobIndex = r.detailTable.Cursor()
				r.detailViewport.SetContent(buildJobDescription(r.detailResult, r.detailTable.Cursor()))
				return r, cmd
			}
		case "left", "h":
			if r.inJobDetail {
				r.selectedJobIndex = maxInt(r.selectedJobIndex-1, 0)
				innerW := r.innerWidth()
				innerH := r.innerHeight()
				r.jobDetailViewport.SetContent(buildFullJobDetail(r.detailResult, r.selectedJobIndex, innerW))
				r.jobDetailViewport.GotoTop()
				r.jobDetailViewport.Height = maxInt(innerH-4, 2)
				return r, nil
			}
		case "right", "l":
			if r.inJobDetail && r.detailResult != nil {
				r.selectedJobIndex = minInt(r.selectedJobIndex+1, len(r.detailResult.Jobs)-1)
				innerW := r.innerWidth()
				innerH := r.innerHeight()
				r.jobDetailViewport.SetContent(buildFullJobDetail(r.detailResult, r.selectedJobIndex, innerW))
				r.jobDetailViewport.GotoTop()
				r.jobDetailViewport.Height = maxInt(innerH-4, 2)
				return r, nil
			}
		}
	case resultsLoadingMsg:
		r.loading = true
		r.lastError = ""
		r.lastExportPath = ""
		return r, nil
	case resultsListMsg:
		r.rows = msg.rows
		r.loading = false
		r.loaded = true
		r.confirmDeleteFilename = ""
		r.deletingFilename = ""
		innerW := r.innerWidth()
		r.table.SetColumns(buildListColumns(innerW))
		r.table.SetRows(buildResultRows(msg.rows, innerW))
		if r.deleteCursor == -1 && r.inDetail {
			r.deleteCursor = r.table.Cursor()
		}
		r.applyListCursorAfterRefresh()
		return r, nil
	case resultDetailMsg:
		r.inDetail = true
		r.detailResult = msg.result
		r.detailFilename = msg.filename
		innerW := r.innerWidth()
		innerH := r.innerHeight()
		jobsH := maxInt((innerH-6)/2, 2)
		descH := maxInt(innerH-6-jobsH, 2)
		r.detailTable = buildJobsTable(msg.result, innerW)
		r.detailViewport = viewport.New(innerW, descH)
		r.selectedJobIndex = 0
		r.detailConfirmDelete = false
		r.detailViewport.SetContent(buildJobDescription(msg.result, 0))
		return r, nil
	case resultsErrMsg:
		r.lastError = msg.err.Error()
		r.loading = false
		r.loaded = true
		r.deletingFilename = ""
		return r, nil
	case resultDeletedMsg:
		if msg.filename == r.detailFilename {
			r.inDetail = false
			r.detailResult = nil
			r.detailFilename = ""
		}
		r.deletingFilename = ""
		r.confirmDeleteFilename = ""
		r.detailConfirmDelete = false
		return r, tea.Batch(r.loadingCmd(), r.refreshCmd())
	case exportDoneMsg:
		r.lastExportPath = msg.path
		return r, nil
	}

	if r.inJobDetail {
		var cmd tea.Cmd
		r.jobDetailViewport, cmd = r.jobDetailViewport.Update(msg)
		return r, cmd
	}
	if r.inDetail {
		var cmd tea.Cmd
		r.detailTable, cmd = r.detailTable.Update(msg)
		r.selectedJobIndex = r.detailTable.Cursor()
		r.detailViewport.SetContent(buildJobDescription(r.detailResult, r.detailTable.Cursor()))
		return r, cmd
	}
	var cmd tea.Cmd
	r.table, cmd = r.table.Update(msg)
	return r, cmd
}

func (r *ResultsModel) View() string {
	panelH := r.panelContentHeight()
	panelW := r.panelContentWidth()

	var content string
	if r.inJobDetail && r.detailResult != nil {
		total := len(r.detailResult.Jobs)
		jobNav := fmt.Sprintf("Job %d / %d", r.selectedJobIndex+1, total)
		header := ui.PanelTitle.Render("JOB DETAIL") + "  " + ui.MetaText.Render(jobNav)
		meta := ui.MetaText.Render("File: "+r.detailFilename+"  Query: "+strings.TrimSpace(r.detailResult.Meta.Query))
		footer := ui.HelpText.Render("←/→ prev/next job   ↑/↓ scroll   o open URL   b/esc back")
		content = lipgloss.JoinVertical(lipgloss.Left,
			header,
			meta,
			r.jobDetailViewport.View(),
			footer,
		)
	} else if r.inDetail && r.detailResult != nil {
		footer := ui.HelpText.Render("↑↓ navigate jobs   enter: view job   o: open URL   b/esc: back   d: delete")
		if r.detailConfirmDelete {
			footer = ui.WarningText.Render("Delete " + r.detailFilename + "? y/n")
		}
		if r.deletingFilename != "" {
			footer = ui.MutedText.Render("Deleting " + r.deletingFilename + "...")
		}
		if r.lastError != "" {
			footer = ui.ErrorText.Render(r.lastError)
		}
		content = lipgloss.JoinVertical(lipgloss.Left,
			renderDetailHeader(r),
			ui.PanelTitle.Render("JOBS"),
			r.detailTable.View(),
			ui.PanelTitle.Render("DETAILS"),
			r.detailViewport.View(),
			footer,
		)
	} else {
		footer := ui.HelpText.Render("↑↓ navigate   enter: view jobs   d: delete   x: export ZIP   r: refresh")
		if r.confirmDeleteFilename != "" {
			footer = ui.WarningText.Render("Delete " + r.confirmDeleteFilename + "? y/n")
		}
		if r.deletingFilename != "" {
			footer = ui.MutedText.Render("Deleting " + r.deletingFilename + "...")
		}
		if r.lastExportPath != "" {
			footer = ui.SuccessText.Render("Exported to: " + r.lastExportPath)
		}
		if r.lastError != "" {
			footer = ui.ErrorText.Render(r.lastError)
		}
		content = lipgloss.JoinVertical(lipgloss.Left,
			renderListHeader(r),
			renderListBody(r),
			footer,
		)
	}

	return ui.Panel.Width(panelW).Height(panelH).Render(content)
}

func (r *ResultsModel) panelContentWidth() int {
	// ui.Panel adds two border cells and one cell of horizontal padding per side.
	return maxInt(r.width-4, 10)
}

func (r *ResultsModel) panelContentHeight() int {
	// The root view renders a one-line tab header above this panel; the panel
	// border accounts for the other two cells.
	return maxInt(r.height-3, 1)
}

func (r *ResultsModel) innerWidth() int {
	return maxInt(r.panelContentWidth()-4, 6)
}

func (r *ResultsModel) innerHeight() int {
	return maxInt(r.panelContentHeight()-2, 1)
}

type resultsListMsg struct {
	rows []api.ResultMeta
}

type resultDetailMsg struct {
	filename string
	result   *api.ResultFile
}

type resultsErrMsg struct {
	err error
}

type resultsLoadingMsg struct{}

type resultDeletedMsg struct {
	filename string
}

func (r *ResultsModel) refreshCmd() tea.Cmd {
	return func() tea.Msg {
		rows, err := r.client.ListResults()
		if err != nil {
			return resultsErrMsg{err: err}
		}
		return resultsListMsg{rows: rows}
	}
}

func (r *ResultsModel) loadingCmd() tea.Cmd {
	return func() tea.Msg {
		return resultsLoadingMsg{}
	}
}

func (r *ResultsModel) openDetailCmd() tea.Cmd {
	idx := r.table.Cursor()
	if idx < 0 || idx >= len(r.rows) {
		return nil
	}
	filename := r.rows[idx].Filename
	return func() tea.Msg {
		res, err := r.client.GetResult(filename)
		if err != nil {
			return resultsErrMsg{err: err}
		}
		return resultDetailMsg{filename: filename, result: res}
	}
}

func (r *ResultsModel) deleteFilenameCmd(filename string) tea.Cmd {
	return func() tea.Msg {
		if err := r.client.DeleteResult(filename); err != nil {
			return resultsErrMsg{err: err}
		}
		return resultDeletedMsg{filename: filename}
	}
}

func (r *ResultsModel) exportCmd() tea.Cmd {
	return func() tea.Msg {
		cwd, err := os.Getwd()
		if err != nil {
			return resultsErrMsg{err: err}
		}
		path, err := r.client.ExportZIP(cwd)
		if err != nil {
			return resultsErrMsg{err: err}
		}
		return exportDoneMsg{path: path}
	}
}

type exportDoneMsg struct {
	path string
}

func (r *ResultsModel) openURLCmd() tea.Cmd {
	if r.detailResult == nil {
		return nil
	}
	idx := r.detailTable.Cursor()
	if idx < 0 || idx >= len(r.detailResult.Jobs) {
		return nil
	}
	url := r.detailResult.Jobs[idx].JobURL
	if strings.TrimSpace(url) == "" {
		return func() tea.Msg {
			return resultsErrMsg{err: fmt.Errorf("no job URL for selected record")}
		}
	}
	return func() tea.Msg {
		cmd := exec.Command("xdg-open", url)
		if _, err := exec.LookPath("xdg-open"); err != nil {
			cmd = exec.Command("open", url)
		}
		if err := cmd.Start(); err != nil {
			return resultsErrMsg{err: err}
		}
		return nil
	}
}

func buildResultRows(results []api.ResultMeta, width int) []table.Row {
	columnWidths := listColumnWidths(width)
	rows := make([]table.Row, 0, len(results))
	for i, row := range results {
		query := strings.TrimSpace(row.Meta.Query)
		if query == "" {
			query = row.Filename
		}
		location := strings.TrimSpace(row.Meta.Location)
		if location == "" {
			location = "Any Region"
		}
		count := row.Meta.Count
		if count == 0 {
			count = row.Count
		}
		scrapedAt := formatScrapedAt(row.Meta.ScrapedAt)
		filename := shortenFilename(row.Filename, columnWidths.filename)
		rows = append(rows, table.Row{
			fmt.Sprintf("%03d", i+1),
			truncate(query, columnWidths.query),
			fmt.Sprintf("%d", count),
			truncate(location, columnWidths.location),
			truncate(scrapedAt, columnWidths.scraped),
			truncate(filename, columnWidths.filename),
		})
	}
	return rows
}

func buildJobsTable(result *api.ResultFile, width int) table.Model {
	columnWidths := detailColumnWidths(width)
	t := table.New(
		table.WithColumns([]table.Column{
			{Title: "Title", Width: columnWidths.title},
			{Title: "Company", Width: columnWidths.company},
			{Title: "Location", Width: columnWidths.location},
			{Title: "Posted", Width: columnWidths.posted},
		}),
		table.WithFocused(true),
	)
	t.SetStyles(ui.TableStyles())
	rows := make([]table.Row, 0, len(result.Jobs))
	for _, job := range result.Jobs {
		rows = append(rows, table.Row{
			truncate(displayValue(job.Title, "(untitled)"), columnWidths.title),
			truncate(displayValue(job.CompanyName, "(unknown company)"), columnWidths.company),
			truncate(displayValue(job.LocationText, "Any Region"), columnWidths.location),
			truncate(displayValue(job.PostedAtText, "-"), columnWidths.posted),
		})
	}
	t.SetRows(rows)
	return t
}

func buildDetailColumns(width int) []table.Column {
	columnWidths := detailColumnWidths(width)
	return []table.Column{
		{Title: "Title", Width: columnWidths.title},
		{Title: "Company", Width: columnWidths.company},
		{Title: "Location", Width: columnWidths.location},
		{Title: "Posted", Width: columnWidths.posted},
	}
}

func buildJobDescription(result *api.ResultFile, index int) string {
	if result == nil || index < 0 || index >= len(result.Jobs) {
		return ""
	}
	job := result.Jobs[index]
	var b strings.Builder
	b.WriteString("Title: " + displayValue(job.Title, "(untitled)"))
	b.WriteString("\nCompany: " + displayValue(job.CompanyName, "(unknown company)"))
	b.WriteString("\nLocation: " + displayValue(job.LocationText, "Any Region"))
	b.WriteString("\nPosted: " + displayValue(job.PostedAtText, "-"))
	if job.JobType != nil && strings.TrimSpace(*job.JobType) != "" {
		b.WriteString("\nJob Type: " + strings.TrimSpace(*job.JobType))
	}
	if job.JobID != nil && strings.TrimSpace(*job.JobID) != "" {
		b.WriteString("\nJob ID: " + strings.TrimSpace(*job.JobID))
	}
	b.WriteString("\nJob URL: " + displayValue(&job.JobURL, "-"))
	if job.CompanyURL != nil && strings.TrimSpace(*job.CompanyURL) != "" {
		b.WriteString("\nCompany URL: " + strings.TrimSpace(*job.CompanyURL))
	}
	b.WriteString("\n\nDescription:\n")
	b.WriteString(displayValue(job.DescriptionText, "No description captured."))
	requirements := strings.TrimSpace(displayValue(job.RequirementsText, ""))
	description := strings.TrimSpace(displayValue(job.DescriptionText, ""))
	if requirements != "" && requirements != description {
		b.WriteString("\n\nRequirements:\n")
		b.WriteString(requirements)
	}
	return b.String()
}

func (r *ResultsModel) openJobDetailCmd() tea.Cmd {
	if r.detailResult == nil || len(r.detailResult.Jobs) == 0 {
		return nil
	}
	idx := r.detailTable.Cursor()
	r.selectedJobIndex = idx
	innerW := r.innerWidth()
	innerH := r.innerHeight()
	vp := viewport.New(innerW, maxInt(innerH-4, 2))
	vp.SetContent(buildFullJobDetail(r.detailResult, idx, innerW))
	r.jobDetailViewport = vp
	r.inJobDetail = true
	return nil
}

func (r *ResultsModel) openURLFromJobDetail() tea.Cmd {
	if r.detailResult == nil {
		return nil
	}
	idx := r.selectedJobIndex
	if idx < 0 || idx >= len(r.detailResult.Jobs) {
		return nil
	}
	url := r.detailResult.Jobs[idx].JobURL
	if strings.TrimSpace(url) == "" {
		return func() tea.Msg {
			return resultsErrMsg{err: fmt.Errorf("no job URL for selected record")}
		}
	}
	return func() tea.Msg {
		cmd := exec.Command("xdg-open", url)
		if _, err := exec.LookPath("xdg-open"); err != nil {
			cmd = exec.Command("open", url)
		}
		if err := cmd.Start(); err != nil {
			return resultsErrMsg{err: err}
		}
		return nil
	}
}

func buildFullJobDetail(result *api.ResultFile, index int, width int) string {
	if result == nil || index < 0 || index >= len(result.Jobs) {
		return ""
	}
	job := result.Jobs[index]
	sep := strings.Repeat("─", maxInt(width, 10))
	var b strings.Builder

	writeField := func(label, value string) {
		if strings.TrimSpace(value) != "" {
			b.WriteString(ui.PanelTitle.Render(label+":") + " " + value + "\n")
		}
	}

	writeField("Title", displayValue(job.Title, "(untitled)"))
	writeField("Company", displayValue(job.CompanyName, "(unknown company)"))
	writeField("Location", displayValue(job.LocationText, "Any Region"))
	writeField("Job Type", displayValue(job.JobType, ""))
	writeField("Posted", displayValue(job.PostedAtText, ""))
	writeField("Posted ISO", displayValue(job.PostedAtIso, ""))
	writeField("Alumni Count", displayValue(job.AlumniCount, ""))
	writeField("Job URL", job.JobURL)
	writeField("Company URL", displayValue(job.CompanyURL, ""))
	writeField("Job ID", displayValue(job.JobID, ""))

	b.WriteString(ui.MutedText.Render(sep) + "\n")

	desc := strings.TrimSpace(displayValue(job.DescriptionText, ""))
	if desc != "" {
		b.WriteString(ui.PanelTitle.Render("Description:") + "\n" + desc + "\n")
	} else {
		b.WriteString(ui.MutedText.Render("No description captured.") + "\n")
	}

	req := strings.TrimSpace(displayValue(job.RequirementsText, ""))
	if req != "" && req != desc {
		b.WriteString("\n" + ui.MutedText.Render(sep) + "\n")
		b.WriteString(ui.PanelTitle.Render("Requirements:") + "\n" + req + "\n")
	}

	return b.String()
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (r *ResultsModel) currentListFilename() string {
	idx := r.table.Cursor()
	if idx < 0 || idx >= len(r.rows) {
		return ""
	}
	return r.rows[idx].Filename
}

func (r *ResultsModel) applyListCursorAfterRefresh() {
	if len(r.rows) == 0 {
		r.table.SetCursor(0)
		r.deleteCursor = -1
		return
	}
	cursor := r.table.Cursor()
	if r.deleteCursor >= 0 {
		cursor = r.deleteCursor
	}
	if cursor < 0 {
		cursor = 0
	}
	if cursor >= len(r.rows) {
		cursor = len(r.rows) - 1
	}
	r.table.SetCursor(cursor)
	r.deleteCursor = -1
}

func renderListHeader(r *ResultsModel) string {
	count := len(r.rows)
	status := "Disconnected"
	statusStyle := ui.ErrorText
	if r.lastError == "" && (r.loaded || r.loading || r.confirmDeleteFilename != "" || r.deletingFilename != "") {
		status = "Connected"
		statusStyle = ui.SuccessText
	}
	header := ui.PanelTitle.Render("DATA REPOSITORIES")
	summary := fmt.Sprintf("Datasets: %d", count)
	meta := "API: " + statusStyle.Render(status)
	return header + "\n" + ui.MetaText.Render(summary+"  "+meta)
}

func renderListBody(r *ResultsModel) string {
	if r.loading {
		if r.loaded && len(r.rows) > 0 {
			notice := ui.MutedText.Render("Querying data store...")
			return lipgloss.JoinVertical(lipgloss.Left, notice, r.table.View())
		}
		return ui.MutedText.Render("Querying data store...")
	}
	if r.lastError != "" {
		return ui.ErrorText.Render("API error: " + r.lastError + " (r: retry)")
	}
	if r.loaded && len(r.rows) == 0 {
		return ui.MutedText.Render("No result JSON files found")
	}
	if !r.loaded {
		return ui.MutedText.Render("Press r to load results")
	}
	return r.table.View()
}

func renderDetailHeader(r *ResultsModel) string {
	meta := r.detailResult.Meta
	query := strings.TrimSpace(meta.Query)
	if query == "" {
		query = "(unknown query)"
	}
	location := strings.TrimSpace(meta.Location)
	if location == "" {
		location = "Any Region"
	}
	count := len(r.detailResult.Jobs)
	if meta.Count > 0 {
		count = meta.Count
	}
	filters := formatFilters(meta.Filters)
	if filters == "" {
		filters = "None"
	}
	header := ui.PanelTitle.Render("RESULT FILE")
	lines := []string{
		ui.MetaText.Render("File: " + r.detailFilename),
		ui.MetaText.Render("Query: " + query),
		ui.MetaText.Render("Location: " + location),
		ui.MetaText.Render("Source: " + displayString(meta.Source, "-") + "  Records: " + fmt.Sprintf("%d", count)),
		ui.MetaText.Render("Filters: " + filters),
	}
	return header + "\n" + strings.Join(lines, "\n")
}

func buildListColumns(width int) []table.Column {
	widths := listColumnWidths(width)
	return []table.Column{
		{Title: "ID", Width: widths.id},
		{Title: "Query", Width: widths.query},
		{Title: "Jobs", Width: widths.jobs},
		{Title: "Location", Width: widths.location},
		{Title: "Scraped", Width: widths.scraped},
		{Title: "Filename", Width: widths.filename},
	}
}

type listWidths struct {
	id       int
	query    int
	jobs     int
	location int
	scraped  int
	filename int
}

func listColumnWidths(width int) listWidths {
	w := maxInt(width-10, 40)
	widths := listWidths{
		id:       3,
		jobs:     5,
		location: 12,
		scraped:  12,
	}
	remaining := w - (widths.id + widths.jobs + widths.location + widths.scraped)
	if remaining < 20 {
		widths.query = 10
		widths.filename = maxInt(remaining-10, 8)
		return widths
	}
	widths.query = maxInt(remaining/2, 12)
	widths.filename = maxInt(remaining-widths.query, 12)
	return widths
}

type detailWidths struct {
	title    int
	company  int
	location int
	posted   int
}

func detailColumnWidths(width int) detailWidths {
	w := maxInt(width-10, 30)
	widths := detailWidths{posted: 10}
	remaining := w - widths.posted
	if remaining < 20 {
		widths.title = 10
		widths.company = 8
		widths.location = maxInt(remaining-18, 6)
		return widths
	}
	widths.title = maxInt(remaining/2, 12)
	widths.company = maxInt(remaining/4, 10)
	widths.location = maxInt(remaining-widths.title-widths.company, 8)
	return widths
}

func formatScrapedAt(value string) string {
	v := strings.TrimSpace(value)
	if v == "" {
		return "-"
	}
	if t, err := time.Parse(time.RFC3339, v); err == nil {
		return t.Format("Jan 02 15:04")
	}
	if t, err := time.Parse(time.RFC3339Nano, v); err == nil {
		return t.Format("Jan 02 15:04")
	}
	return truncate(v, 16)
}

func shortenFilename(filename string, max int) string {
	if max <= 0 {
		return ""
	}
	if len(filename) <= max {
		return filename
	}
	if max <= 6 {
		return truncate(filename, max)
	}
	prefix := maxInt(max-6, 1)
	return filename[:prefix] + "..." + filename[len(filename)-3:]
}

func formatFilters(filters api.Filters) string {
	parts := []string{}
	if len(filters.ExperienceLevel) > 0 {
		parts = append(parts, "exp="+strings.Join(filters.ExperienceLevel, ","))
	}
	if filters.RemoteOnly != nil {
		if *filters.RemoteOnly {
			parts = append(parts, "remote=true")
		} else {
			parts = append(parts, "remote=false")
		}
	}
	if filters.PostedWithin != nil && strings.TrimSpace(*filters.PostedWithin) != "" {
		parts = append(parts, "posted="+strings.TrimSpace(*filters.PostedWithin))
	}
	if len(filters.JobType) > 0 {
		parts = append(parts, "type="+strings.Join(filters.JobType, ","))
	}
	return strings.Join(parts, " | ")
}

func displayValue(value *string, fallback string) string {
	if value == nil {
		return fallback
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return fallback
	}
	return trimmed
}

func displayString(value string, fallback string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback
	}
	return trimmed
}

func truncate(value string, max int) string {
	if len(value) <= max {
		return value
	}
	if max <= 3 {
		return value[:max]
	}
	return value[:max-3] + "..."
}
