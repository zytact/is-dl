# Search and triage

Search LinkedIn, Unstop, or both, normalize the listings, classify pay and location conflicts, apply local filters, merge source results, and save one run.

## Sub-features

- Source selection with `--source linkedin`, `--source unstop`, or both.
- Unstop opportunity and role selection.
- LinkedIn filters for experience level, job type, posting age, location, and remote. Posting age is the `f_TPR` URL parameter. The rest are appended to the keywords as text, for example `software engineer intern, internship, remote, in India`, and LinkedIn interprets that text itself.
- Local Unstop keyword, location, and remote filtering.
- Unpaid, applied, and seen filtering across sources.
- A company blocklist from the `blocked-companies` config key or `--blocked-companies`, which every source applies while it pages.
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

The blocklist needs a company the live corpus is showing right now, so take one from a first search and block it in a second. `--verbose` keeps the log on stderr next to `--json`:

```bash
BLOCK="$(node -e 'const v=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(v.jobs[0].companyName)' "$EV/search.json")"

$D search -k software --source unstop --unstop-roles software-development --limit 3 \
  --blocked-companies "$BLOCK" --json --verbose \
  >"$EV/blocked.json" 2>"$EV/blocked.stderr"
printf '%s\n' "$?" >"$EV/blocked.exit"

$D config set blocked-companies "$BLOCK" --json >"$EV/blocked-config-set.json"
$D search -k software --source unstop --unstop-roles software-development --limit 3 --json --verbose \
  >"$EV/blocked-config.json" 2>"$EV/blocked-config.stderr"
$D search -k software --source unstop --unstop-roles software-development --limit 3 \
  --blocked-companies "" --json --verbose \
  >"$EV/blocked-cleared.json" 2>"$EV/blocked-cleared.stderr"
$D config set blocked-companies "" --json >"$EV/blocked-config-restore.json"
```

For LinkedIn, run the LinkedIn recipe once with `--limit 5`, take `BLOCK` from the company that fills the most of its jobs, and run it again with `--blocked-companies "$BLOCK" --verbose`.

### Proof

Exit code is 0. `search.json` has `ok: true`, one saved `path`, and at least one job when the live corpus contains a match. The Unstop entry in `meta.sources[]` has `status: "ok"`, and every returned job has `source: "unstop"`. The file at `path` exists and contains the same run data.

For the LinkedIn recipe, the exit code is 0 and `meta.sources[]` has a `linkedin` entry with `status: "ok"`. Each job has a non-null `jobId`, `title`, `companyName`, `locationText` and `descriptionText`. Assert the shape and a bounded count, not particular jobs.

A company without a LinkedIn page has a different top card, so prove that layout as well when a change touches the detail pane. Put such a company's name in the keywords. A saved run names one wherever `companyName` is set and `companyUrl` is null. Runs saved before the fix for issue #38 have both null for these listings, so there the company has to come from the listing's description:

```bash
$D search -k "<company> <job title>" --source linkedin -l India --limit 3 --json \
  >"$EV/linkedin-pageless.json" 2>"$EV/linkedin-pageless.stderr"
printf '%s\n' "$?" >"$EV/linkedin-pageless.exit"
```

Its job has a non-null `companyName`, `locationText` and `postedAtText` with a null `companyUrl`. Any other job in the run with a non-null `companyUrl` covers the usual layout. Without one, the recipe above covers it.

The pills under the title become `jobType`, and a pay pill also decides `pay`. Prove both when a change touches the detail pane. A US internship search shows pay pills and the "I'm interested" button more often than an India one, and 10 listings are enough to meet both:

```bash
$D search -k "software engineer intern" --source linkedin -l "United States" --remote-only \
  --experience-level Internship --posted-within "Past week" --limit 10 --json \
  >"$EV/linkedin-pills.json" 2>"$EV/linkedin-pills.stderr"
printf '%s\n' "$?" >"$EV/linkedin-pills.exit"

node -e 'const v=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); for (const j of v.jobs) console.log([j.jobId, j.companyName, j.jobType, j.pay.kind, j.pay.evidence].join(" | "))' \
  "$EV/linkedin-pills.json" >"$EV/linkedin-pills.txt"
```

Every `jobType` is pills joined by `·`, such as `Remote · Internship` or `$18.75/hr - $22.25/hr · Remote · Internship`, and none holds a button label such as `I’m interested` or `Show all`. Most listings have a workplace or employment type pill, so a run where every `jobType` is null means the pill row has moved. A job whose `jobType` starts with an amount per period has `pay.kind: "paid"` and that pill as `pay.evidence`. If the run has no pay pill, search again with that kind of company in the keywords, or say that the pay half went unproven.

For the blocklist, no job in `blocked.json` or `blocked-config.json` has the blocked `companyName`, and each stderr has `Skipped <n> from blocked companies: <names>.` naming it. The source count in `meta.sources[]` still reaches the limit when the corpus has enough other listings. `blocked-cleared.stderr` has no such line, and the company may be back in `blocked-cleared.json`. On LinkedIn, also count the `Processing job` lines in stderr: there is one per returned job, which shows that a blocked card was never opened.

For multi-source behavior, prove each entry in `meta.sources[]`. Exit 0 alone is insufficient because partial failure is normal.

## Gotchas

- `--limit` applies to each source and counts listings that passed `known` and the company blocklist.
- A blocklist entry matches a company whose name contains it as whole words, ignoring case and punctuation. `UM IT` blocks `UM IT Solutions` and leaves `Premium IT` alone.
- `--blocked-companies` and `config set blocked-companies` split on commas. A name with a comma in it becomes two entries, so write it into the TOML array by hand. An empty value clears the list.
- The blocklist line is a log line. With `--json` it appears on stderr only when `--verbose` is also passed, and the saved run does not record the list.
- LinkedIn reads a card's company from the card's second paragraph. If a blocked company shows up in the `Processing job` lines, that read has drifted, and the source drops the job after opening it instead.
- `--out -` prints data but bypasses saved runs and the seen ledger.
- A LinkedIn pay pill is an amount per period in any currency, such as `30K GBP/yr`. It classifies the listing as `paid` ahead of anything the description says, and the rupee token ceiling does not apply to it.
- LinkedIn exit 3 means a session is required. Existing but expired cookies can instead cause a timeout. Replace them with `scripts/login.sh logout`, then `scripts/login.sh` in a TTY.
- LinkedIn ignores the `location`, `f_WT`, `f_E`, `f_JT` and `sortBy` URL parameters since its redesign. A search with no `-l` uses the LinkedIn account's last searched location, so results may not match the location you expect. A location such as "Worldwide" can resolve to a specific country.
- A LinkedIn job list that never appears fails the source with `LinkedIn's job list did not appear within 15s ... LinkedIn may have changed its page layout.` A missing job description logs a warning to stderr and keeps the job with a null `descriptionText`.
- A LinkedIn detail pane that never shows its title leaves the job out of the run, with `Error processing job <n>: The detail pane for job <id> did not load` on stderr. The job is not marked seen, so a later search opens it again. Five in a row end the source. This needs LinkedIn to fail a load, so it has no live recipe.
- `--exclude-unpaid` runs after the source limits, so the final count can be lower. Source counts in `meta.sources[]` precede this final filter.
- Unstop is live data. Assert schema, source status, filters, and bounded counts rather than a particular job title or id.
- Search never applies for a job.
