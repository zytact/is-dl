# is-dl feature map

This map covers every user-facing surface. Read the capability file and each surface file touched by the change. A shared search or run-store change needs proof through the CLI or API plus every client whose rendering or interaction changed.

| Feature                                           | Main commands                   | External dependency                                 |
| ------------------------------------------------- | ------------------------------- | --------------------------------------------------- |
| [Search and triage](./search-and-triage.md)       | `search`                        | Unstop network, or LinkedIn plus Chromium and login |
| [Runs and seen listings](./runs-and-seen.md)      | `runs`, `search --exclude-seen` | source network to create runs                       |
| [Application tracking](./application-tracking.md) | `apps`                          | a saved run for job metadata                        |
| [Job notes](./job-notes.md)                       | `notes`                         | a known source or saved run                         |
| [Resume pipeline](./resume-pipeline.md)           | `resume`                        | Tectonic and pdftotext for PDF builds               |
| [REST API](./rest-api.md)                         | `/api/*`                        | listener on port 3000                               |
| [Website](./website.md)                           | React browser UI                | API plus listener on port 5173                      |
| [TUI](./tui.md)                                   | Go terminal UI                  | API plus tmux                                       |

Keep this map current with `/maintain-verification-skill` as commands and user workflows change.
