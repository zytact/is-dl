# Search and triage

Search LinkedIn, Unstop, or both, normalize the listings, classify pay and location conflicts, apply local filters, merge source results, and save one run.

## Sub-features

- Source selection with `--source linkedin`, `--source unstop`, or both.
- Unstop opportunity and role selection.
- LinkedIn URL filters for experience level, job type, and posting age.
- Local Unstop keyword, location, and remote filtering; LinkedIn sends those filters in its search URL.
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

### Proof

Exit code is 0. `search.json` has `ok: true`, one saved `path`, and at least one job when the live corpus contains a match. The Unstop entry in `meta.sources[]` has `status: "ok"`, and every returned job has `source: "unstop"`. The file at `path` exists and contains the same run data.

For multi-source behavior, prove each entry in `meta.sources[]`. Exit 0 alone is insufficient because partial failure is normal.

## Gotchas

- `--limit` applies to each source and counts listings that passed `known`.
- `--out -` prints data but bypasses saved runs and the seen ledger.
- LinkedIn exit 3 means a session is required. Existing but expired cookies can instead cause a timeout. Replace them with `scripts/login.sh logout`, then `scripts/login.sh` in a TTY.
- `--exclude-unpaid` runs after the source limits, so the final count can be lower. Source counts in `meta.sources[]` precede this final filter.
- Unstop is live data. Assert schema, source status, filters, and bounded counts rather than a particular job title or id.
- Search never applies for a job.
