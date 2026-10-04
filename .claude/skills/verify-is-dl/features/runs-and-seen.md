# Runs and seen listings

Saved searches become immutable run JSON files with an index. A derived seen ledger lets later searches omit listings surfaced by earlier saved runs.

## Sub-features

- List runs, filter by date, and limit the list.
- Show a run by id or `latest`.
- Remove a run and update the index.
- Backfill and rebuild `seen.jsonl` from saved runs.
- Page past known jobs with `search --exclude-seen`.
- Normalize legacy runs whose `meta.sources` field is absent.

## How to get to it (user POV)

Run a search with the default output setting, then use `is-dl runs list` or `is-dl runs show latest`. Add `--exclude-seen` to a later search when only new listings matter.

## Driving it with the CLI harness

```bash
D=.agents/skills/verify-is-dl/scripts/drive.sh

$D search -k software --source unstop --unstop-roles software-development --limit 1 --json >"$EV/search.json"
$D runs list --json >"$EV/runs.json"
$D runs show latest --json >"$EV/latest.json"
$D search -k software --source unstop --unstop-roles software-development --limit 1 --exclude-seen --json >"$EV/unseen.json"
```

### Proof

The run id and count in `runs.json` match `search.json`. `latest.json` contains the same jobs. The saved run, `index.json`, and `seen.jsonl` exist below `$XDG_DATA_HOME/is-dl/`. Every non-null `source:jobId` from the first saved run appears in the ledger. The second run contains no id already present in the first run.

## Gotchas

- Removing a run leaves the existing seen ledger intact. A missing ledger is rebuilt on the next saved or `--exclude-seen` search using only remaining runs.
- Config, profiles, or `IS_DL_OUT_DIR` can override the default output even without `--out`.
- A null job id cannot be tracked and may resurface.
- Runs written through `--out <dir>` and `--out -` never enter the ledger.
- Two boards can use the same numeric id. Compare `source:jobId`, not the id alone.
