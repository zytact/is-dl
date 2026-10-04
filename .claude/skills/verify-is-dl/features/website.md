# Website

The React interface for configuring a search, watching logs, aborting work, and inspecting or exporting saved results.

## Sub-features

- Select LinkedIn, Unstop, opportunity type, and Unstop roles.
- Enter search filters and start a scrape.
- Watch SSE status and logs, then abort an active scrape.
- Navigate between Terminal and Payloads.
- List runs, open the inspector, switch jobs, download, export, and delete.
- Show failed source details, AI-agent signals, compensation, and pay evidence.
- Filter inspector jobs by source and AI confidence.

## How to get to it (user POV)

Launch the verification session and open `$IS_DL_VERIFY_WEB_URL`. `Terminal` contains the form and log panel. `Payloads` contains saved runs.

## Driving it with the browser harness

Use `scripts/browser.mjs` against the dedicated Chromium that launch started:

1. Capture the empty Terminal page.
2. Run `click-text` against the pressed source buttons and `LinkedIn`, then confirm its `aria-pressed` value is false. Leave `Unstop` selected.
3. Fill `#keywords` with `software` and `#limit` with `1`.
4. Click `INITIATE_SEQUENCE` and capture the started state. `EXECUTING...` can be brief for a small search.
5. Wait for visible `SCRAPE FINISHED` and `SYS: ONLINE`.
6. Click `Payloads`, wait for `DATA_REPOSITORIES`, and capture the new row.
7. Use `click-text` on `tbody td:nth-child(2) > span:first-child` with `software`, wait for `INSPECTOR_PROTOCOL`, and capture its source and record count.

### Proof

The before-and-after screenshots show the real clicks and resulting screens. The page text reaches `SCRAPE FINISHED`, then the results screen and inspector show the saved run. `/api/results` contains the displayed run, and its saved file exists in the isolated run store.

## Gotchas

- Both sources start selected. Deselect LinkedIn for an account-free proof.
- The website calls `/api` on its own origin. Vite dev and preview forward it to `IS_DL_API_URL`, else `http://localhost:3000`.
- Search completion is asynchronous. Waiting only for the POST response proves nothing about the result.
- Row action icons have stable `title` values. Prefer them over coordinates.
- `click-text` matches exact text, so target the query span rather than the entire row.
- `Purge Record` opens a confirmation; `Purge` deletes the run. `EXPORT ALL` downloads the ZIP.
- Source filters appear only when a run contains jobs from multiple boards.
- Downloads use the browser's download directory. Record the browser artifact path when proving export.
