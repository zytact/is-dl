package model

import (
	"fmt"
	"testing"

	"github.com/zytact/is-dl-tui/api"
)

func TestLogsKeepsOnlyTheMostRecentLines(t *testing.T) {
	logs := NewLogs()
	logs.SetSize(80, 24)

	for i := range maxLogLines + 500 {
		logs.ApplyEvent(api.SSEEvent{Type: "log", Message: fmt.Sprintf("line %d", i)})
	}

	if len(logs.lines) != maxLogLines {
		t.Fatalf("kept %d lines, want %d", len(logs.lines), maxLogLines)
	}
	if got, want := logs.lines[0], fmt.Sprintf("line %d", 500); got != want {
		t.Fatalf("oldest kept line is %q, want %q", got, want)
	}
	if got, want := logs.lines[len(logs.lines)-1], fmt.Sprintf("line %d", maxLogLines+499); got != want {
		t.Fatalf("newest line is %q, want %q", got, want)
	}
}
