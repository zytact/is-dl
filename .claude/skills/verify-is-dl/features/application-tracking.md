# Application tracking

Record that a person applied and track later status changes in an append-only local log. The first `apps add` for a job also keeps a snapshot of its listing beside the job's notes, so the description survives `runs rm` and the board taking it down. The command never submits an application.

## Sub-features

- Add an application from a known job, with optional resume variant, and store its listing in `notes/<board>/<jobId>/listing.json`.
- Add a job no search found with `--listing <file>`, a JSON object in the `JobListing` shape.
- Refuse, with exit 2, a job whose saved copies all lost their title or company.
- Change status while preserving history.
- List current states with status and age filters.
- Show history, related notes, attachments, and the stored listing.
- Disambiguate colliding job ids with `--source`.

## How to get to it (user POV)

Search for a job, copy its job id, then run `is-dl apps add <jobId>`. Update it with `apps status`, and inspect it with `apps show` or `apps list`.

## Driving it with the CLI harness

Use the launched session, `$EV`, and a nonempty saved Unstop search from the search recipe.

```bash
D=.agents/skills/verify-is-dl/scripts/drive.sh
JOB_ID="$(node -e 'const v=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(v.jobs[0].jobId)' "$EV/search.json")"

$D apps add "$JOB_ID" --source unstop --variant default --json >"$EV/apps-add.json"
$D apps status "$JOB_ID" interview --source unstop --json >"$EV/apps-status.json"
$D apps show "$JOB_ID" --source unstop --json >"$EV/apps-show.json"
$D apps list --status interview --json >"$EV/apps-list.json"
```

To prove the listing outlives its run, remove the run and show the application again. Then drive a job no run holds, first bare, then with a hand-written listing:

```bash
RUN_ID="$(node -e 'const v=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(v.record.source)' "$EV/apps-add.json")"
$D runs rm "$RUN_ID"
$D apps show "$JOB_ID" --source unstop --json >"$EV/apps-show-after-rm.json"

$D apps add 4477254540 --source linkedin; echo "exit=$?"
printf '%s' '{"title":"AI Engineering Intern","companyName":"Time Seventeen","jobUrl":"https://www.linkedin.com/jobs/view/4477254540/","descriptionText":"Build LLM agents."}' >"$EV/manual-listing.json"
$D apps add 4477254540 --source linkedin --listing "$EV/manual-listing.json" --json >"$EV/apps-add-manual.json"
```

### Proof

`apps-show.json` contains two history records in order, first `applied`, then `interview`, and a `listing` equal to the job in `search.json`. The current list has one matching application. `$XDG_DATA_HOME/is-dl/applications.jsonl` has two valid JSON lines for the same `unstop:jobId`, and the second line retains the metadata from the first. `$XDG_DATA_HOME/is-dl/notes/unstop/$JOB_ID/listing.json` holds the same listing, and `apps-show-after-rm.json` still has it. The bare `apps add 4477254540` exits 2 with `No run holds 4477254540` and appends nothing. `apps-add-manual.json` has `company: "Time Seventeen"` and `source: "manual"`, and `notes/linkedin/4477254540/listing.json` exists.

## Gotchas

- `apps add` changes only local state, the log and the listing snapshot. It does not contact an employer.
- Job metadata comes from the saved run whose copy kept the most: a title and company first, then a description, then the newest. A job no run holds needs `--listing`, which requires `title`, `companyName` and `jobUrl`, takes the board from `--source` or its `source` field, and cannot be combined with `--from-run`. Pay and AI signals are derived from its text.
- A later `apps add` for the same job keeps the first snapshot. `apps show` prints `listing: none` for applications logged before snapshots existed.
- Current state is the last JSONL record for one `source:jobId`.
- Use a status accepted by the current CLI. Invalid values exit 2.
