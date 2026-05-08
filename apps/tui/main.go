package main

import (
	"context"
	"fmt"
	"os"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/zytact/is-dl-tui/api"
	"github.com/zytact/is-dl-tui/model"
)

func main() {
	client := api.NewClient("http://localhost:3000")
	m := model.New(client)
	p := tea.NewProgram(m, tea.WithAltScreen(), tea.WithMouseAllMotion())

	ctx, cancel := context.WithCancel(context.Background())
	logCh := make(chan api.SSEEvent, 128)

	go func() {
		defer close(logCh)
		for {
			_ = client.StreamLogs(ctx, logCh)
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
			}
		}
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
