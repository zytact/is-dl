# Search and triage

Search LinkedIn, Unstop, or both, normalize the listings, classify pay and location conflicts, apply local filters, merge source results, and save one run.

## Sub-features

- Source selection with `--source linkedin`, `--source unstop`, or both.
- Unstop opportunity and role selection.
- LinkedIn filters for experience level, job type, posting age, location, and remote. Posting age is the `f_TPR` URL parameter. The rest are appended to the keywords as text, for example `software engineer intern, internship, remote, in India`, and LinkedIn interprets that text itself.
- Local Unstop keyword, location, and remote filtering.
- Unpaid, applied, and seen filtering across sources.
- Partial source failure with per-source status in `meta.sources[]`.
- JSON output, explicit output directories, and the default run store.

## How to get to it (user POV)

Run `is-dl search` with keywords. Unstop works without authentication. LinkedIn requires one interactive login, which the harness stores outside the run directory so it is reused by every later run.

## Driving it with the CLI harness

Launch the session and pass doctor first, as described in SKILL.md. Keep this proof directory for the dependent runs, applications, and notes recipes.

```bash
D=.agents/skills/verify-is-dl/scripts/drive.sh
EV=".local/verify-evidence/is-dl/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$EV"

$D search -k software --source unstop --unstop-roles software-development --limit 1 --json \
  >"$EV/search.json" 2>"$EV/search.stderr"
printf '%s\n' "$?" >"$EV/search.exit"
```

LinkedIn needs the stored login and Chromium. Keep `--limit` at 1 to 3, because each job takes about 10 seconds:

```bash
$D search -k "software engineer intern" --source linkedin -l India --remote-only \
  --experience-level Internship --limit 2 --json \
  >"$EV/linkedin.json" 2>"$EV/linkedin.stderr"
printf '%s\n' "$?" >"$EV/linkedin.exit"
```

### Proof

Exit code is 0. `search.json` has `ok: true`, one saved `path`, and at least one job when the live corpus contains a match. The Unstop entry in `meta.sources[]` has `status: "ok"`, and every returned job has `source: "unstop"`. The file at `path` exists and contains the same run data.

For the LinkedIn recipe, the exit code is 0 and `meta.sources[]` has a `linkedin` entry with `status: "ok"`. Each job has a non-null `jobId`, `title`, `companyName`, `locationText` and `descriptionText`. Assert the shape and a bounded count, not particular jobs.

For multi-source behavior, prove each entry in `meta.sources[]`. Exit 0 alone is insufficient because partial failure is normal.

## Gotchas

- `--limit` applies to each source and counts listings that passed `known`.
- `--out -` prints data but bypasses saved runs and the seen ledger.
- LinkedIn exit 3 means a session is required. Existing but expired cookies can instead cause a timeout. Replace them with `scripts/login.sh logout`, then `scripts/login.sh` in a TTY.
- LinkedIn ignores the `location`, `f_WT`, `f_E`, `f_JT` and `sortBy` URL parameters since its redesign. A search with no `-l` uses the LinkedIn account's last searched location, so results may not match the location you expect. A location such as "Worldwide" can resolve to a specific country.
- A LinkedIn job list that never appears fails the source with `LinkedIn's job list did not appear within 15s ... LinkedIn may have changed its page layout.` A missing job description logs a warning to stderr and keeps the job with a null `descriptionText`.
- `--exclude-unpaid` runs after the source limits, so the final count can be lower. Source counts in `meta.sources[]` precede this final filter.
- Unstop is live data. Assert schema, source status, filters, and bounded counts rather than a particular job title or id.
- Search never applies for a job.
