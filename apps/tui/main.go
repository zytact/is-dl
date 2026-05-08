package main

import (
  "context"
  "fmt"
  "os"

  tea "github.com/charmbracelet/bubbletea"

  "github.com/arnab/is-dl-tui/api"
  "github.com/arnab/is-dl-tui/model"
)

func main() {
  client := api.NewClient("http://localhost:3000")
  m := model.New(client)
  p := tea.NewProgram(m, tea.WithAltScreen(), tea.WithMouseAllMotion())

  ctx, cancel := context.WithCancel(context.Background())
  logCh := make(chan api.SSEEvent, 128)

  go func() {
    defer close(logCh)
    _ = client.StreamLogs(ctx, logCh)
  }()

  go func() {
    for evt := range logCh {
      p.Send(model.LogEventMsg{Event: evt})
    }
  }()

  if _, err := p.Run(); err != nil {
    fmt.Fprintln(os.Stderr, "tui error:", err)
  }

  cancel()
}
