# Application tracking

Record that a person applied and track later status changes in an append-only local log. The command never submits an application.

## Sub-features

- Add an application from a known job, with optional resume variant.
- Change status while preserving history.
- List current states with status and age filters.
- Show history, related notes, and attachments.
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

### Proof

`apps-show.json` contains two history records in order, first `applied`, then `interview`. The current list has one matching application. `$XDG_DATA_HOME/is-dl/applications.jsonl` has two valid JSON lines for the same `unstop:jobId`, and the second line retains the metadata from the first.

## Gotchas

- `apps add` changes only the local log. It does not contact an employer.
- Job metadata comes from the saved run. `--source` without a run permits a manual record but has null company, title, and URL.
- Current state is the last JSONL record for one `source:jobId`.
- Use a status accepted by the current CLI. Invalid values exit 2.
