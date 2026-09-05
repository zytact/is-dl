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

	// Whatever has already queued up goes in one message. The channel is
	// buffered, so a scrape that logs faster than the UI redraws arrives as a
	// handful of batches instead of hundreds of updates.
	go func() {
		for evt := range logCh {
			batch := []api.SSEEvent{evt}
			for draining := true; draining; {
				select {
				case next, ok := <-logCh:
					if !ok {
						draining = false
						break
					}
					batch = append(batch, next)
				default:
					draining = false
				}
			}
			p.Send(model.LogEventsMsg{Events: batch})
		}
	}()

	if _, err := p.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "tui error:", err)
	}

	cancel()
}
