package model

import (
  "fmt"
  "os"
  "os/exec"
  "strings"

  tea "github.com/charmbracelet/bubbletea"
  "github.com/charmbracelet/bubbles/table"
  "github.com/charmbracelet/bubbles/viewport"
  "github.com/charmbracelet/lipgloss"

  "github.com/arnab/is-dl-tui/api"
  "github.com/arnab/is-dl-tui/ui"
)

type ResultsModel struct {
  client *api.Client
  width  int
  height int

  table table.Model
  rows     []api.ResultMeta
  inDetail bool
  detailResult  *api.ResultFile
  detailTable   table.Model
  detailViewport viewport.Model
  detailFilename string

  confirmDelete  bool
  lastExportPath string
  lastError      string
}

func NewResults(client *api.Client) *ResultsModel {
  t := table.New(
    table.WithColumns([]table.Column{
      {Title: "Query", Width: 20},
      {Title: "Location", Width: 16},
      {Title: "Jobs", Width: 6},
      {Title: "Scraped At", Width: 19},
    }),
    table.WithFocused(true),
  )
  t.SetStyles(ui.TableStyles())
  dv := viewport.New(0, 0)
  dv.SetContent("Press r to load results")
  return &ResultsModel{
    client: client,
    table: t,
    detailViewport: dv,
  }
}

func (r *ResultsModel) Refresh() tea.Cmd {
  return r.refreshCmd()
}

func (r *ResultsModel) SetSize(width, height int) {
  r.width = width
  r.height = height
  r.table.SetHeight(maxInt(0, height-6))
  if r.inDetail {
    r.detailTable.SetHeight(maxInt(0, height/2-4))
    r.detailViewport.Width = maxInt(0, width-4)
    r.detailViewport.Height = maxInt(0, height/2-6)
  }
}

func (r *ResultsModel) Update(msg tea.Msg) (*ResultsModel, tea.Cmd) {
  switch msg := msg.(type) {
  case tea.KeyMsg:
    r.lastError = ""
    r.lastExportPath = ""
    switch msg.String() {
    case "r":
      return r, r.refreshCmd()
    case "d":
      if !r.inDetail {
        r.confirmDelete = true
      }
      return r, nil
    case "y":
      if r.confirmDelete {
        r.confirmDelete = false
        return r, r.deleteCmd()
      }
    case "n", "esc":
      if r.confirmDelete {
        r.confirmDelete = false
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
      if r.inDetail {
        return r, r.openURLCmd()
      }
      return r, r.openDetailCmd()
    case "o":
      if r.inDetail {
        return r, r.openURLCmd()
      }
    case "up", "down":
      if r.inDetail {
        var cmd tea.Cmd
        r.detailTable, cmd = r.detailTable.Update(msg)
        r.detailViewport.SetContent(buildJobDescription(r.detailResult, r.detailTable.Cursor()))
        return r, cmd
      }
    }
  case resultsListMsg:
    r.rows = msg.rows
    r.confirmDelete = false
    r.table.SetRows(buildResultRows(msg.rows))
    return r, nil
  case resultDetailMsg:
    r.inDetail = true
    r.detailResult = msg.result
    r.detailFilename = msg.filename
    r.detailTable = buildJobsTable(msg.result)
    r.detailViewport = viewport.New(maxInt(0, r.width-4), maxInt(0, r.height/2-6))
    r.detailViewport.SetContent(buildJobDescription(msg.result, 0))
    return r, nil
  case resultsErrMsg:
    r.lastError = msg.err.Error()
    return r, nil
  case exportDoneMsg:
    r.lastExportPath = msg.path
    return r, nil
  }

  if r.inDetail {
    var cmd tea.Cmd
    r.detailTable, cmd = r.detailTable.Update(msg)
    r.detailViewport.SetContent(buildJobDescription(r.detailResult, r.detailTable.Cursor()))
    return r, cmd
  }
  var cmd tea.Cmd
  r.table, cmd = r.table.Update(msg)
  return r, cmd
}

func (r *ResultsModel) View() string {
  if r.inDetail && r.detailResult != nil {
    title := fmt.Sprintf("JOBS: %s (%d results)", r.detailFilename, len(r.detailResult.Jobs))
    header := ui.Panel.Render(ui.PanelTitle.Render(title) + "\n" + r.detailTable.View())
    desc := ui.Panel.Render(ui.PanelTitle.Render("DESCRIPTION") + "\n" + r.detailViewport.View())
    footer := ui.HelpText.Render("↑↓ navigate jobs   enter/o: open URL   esc: back")
    return lipgloss.JoinVertical(lipgloss.Left, header, desc, footer)
  }

  body := ui.Panel.Render(ui.PanelTitle.Render("RESULTS") + "\n" + r.table.View())
  footer := ui.HelpText.Render("↑↓ navigate   enter: view jobs   d: delete   x: export ZIP   r: refresh")
  if r.confirmDelete {
    footer = ui.ErrorText.Render("Confirm delete? y/n")
  }
  if r.lastExportPath != "" {
    footer = ui.HelpText.Render("Exported to: " + r.lastExportPath)
  }
  if r.lastError != "" {
    footer = ui.ErrorText.Render(r.lastError)
  }
  return lipgloss.JoinVertical(lipgloss.Left, body, footer)
}

type resultsListMsg struct {
  rows []api.ResultMeta
}

type resultDetailMsg struct {
  filename string
  result *api.ResultFile
}

type resultsErrMsg struct {
  err error
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

func (r *ResultsModel) deleteCmd() tea.Cmd {
  idx := r.table.Cursor()
  if idx < 0 || idx >= len(r.rows) {
    return nil
  }
  filename := r.rows[idx].Filename
  return func() tea.Msg {
    if err := r.client.DeleteResult(filename); err != nil {
      return resultsErrMsg{err: err}
    }
    rows, err := r.client.ListResults()
    if err != nil {
      return resultsErrMsg{err: err}
    }
    return resultsListMsg{rows: rows}
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

func buildResultRows(results []api.ResultMeta) []table.Row {
  rows := make([]table.Row, 0, len(results))
  for _, row := range results {
    scrapedAt := row.Meta.ScrapedAt
    if scrapedAt == "" {
      scrapedAt = "-"
    }
    rows = append(rows, table.Row{
      truncate(row.Meta.Query, 20),
      truncate(row.Meta.Location, 16),
      fmt.Sprintf("%d", row.Count),
      truncate(scrapedAt, 19),
    })
  }
  return rows
}

func buildJobsTable(result *api.ResultFile) table.Model {
  t := table.New(
    table.WithColumns([]table.Column{
      {Title: "Title", Width: 18},
      {Title: "Company", Width: 16},
      {Title: "Location", Width: 14},
      {Title: "Posted", Width: 12},
    }),
    table.WithFocused(true),
  )
  t.SetStyles(ui.TableStyles())
  rows := make([]table.Row, 0, len(result.Jobs))
  for _, job := range result.Jobs {
    rows = append(rows, table.Row{
      truncate(deref(job.Title), 18),
      truncate(deref(job.CompanyName), 16),
      truncate(deref(job.LocationText), 14),
      truncate(deref(job.PostedAtText), 12),
    })
  }
  t.SetRows(rows)
  return t
}

func buildJobDescription(result *api.ResultFile, index int) string {
  if result == nil || index < 0 || index >= len(result.Jobs) {
    return ""
  }
  job := result.Jobs[index]
  var b strings.Builder
  b.WriteString("Title: " + deref(job.Title))
  b.WriteString("\nCompany: " + deref(job.CompanyName))
  b.WriteString("\nLocation: " + deref(job.LocationText))
  b.WriteString("\nPosted: " + deref(job.PostedAtText))
  b.WriteString("\n\nDescription:\n")
  b.WriteString(deref(job.DescriptionText))
  b.WriteString("\n\nRequirements:\n")
  b.WriteString(deref(job.RequirementsText))
  return b.String()
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

func deref(value *string) string {
  if value == nil {
    return ""
  }
  return *value
}
