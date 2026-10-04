# Job notes

Keep markdown and binary attachments beside a job without tying them to an application record.

## Sub-features

- Add note text inline, from stdin, or from a file.
- Preserve the note body byte for byte.
- Fill company and role from a saved run.
- List, show, locate, and remove notes.
- Copy attachments unchanged while sanitizing their names.
- Separate jobs by source when numeric ids collide.

## How to get to it (user POV)

Use a job id from a saved run and run `is-dl notes add <jobId>`. Notes may be created before applying. Attach a brief with `notes attach`.

## Driving it with the CLI harness

```bash
D=.agents/skills/verify-is-dl/scripts/drive.sh
JOB_ID="$(node -e 'const v=require(process.argv[1]); process.stdout.write(v.jobs[0].jobId)' "$EV/search.json")"
printf 'Hiring process\n\nTechnical screen first.  \n' >"$EV/note-input.md"
printf 'brief bytes\n' >"$EV/take home.txt"

$D notes add "$JOB_ID" --source unstop --file "$EV/note-input.md" --json >"$EV/note-add.json"
$D notes attach "$JOB_ID" --source unstop --file "$EV/take home.txt" --json >"$EV/note-attach.json"
$D notes show "$JOB_ID" --source unstop --json >"$EV/note-show.json"
```

### Proof

`note-show.json` reports the note and attachment under `unstop:jobId`. The note file body exactly matches `note-input.md`, including the trailing spaces and final newline. The attached file is named `take-home.txt`, and a byte comparison with the input succeeds.

## Gotchas

- The source, job id, and note id come from the path. Front matter does not carry identity.
- `notes add` needs a saved run unless `--source` supplies the board.
- `notes edit` with no body opens `$EDITOR` only on a TTY. Drive it with `scripts/cli.sh --tty` and a non-interactive `EDITOR`, as SKILL.md shows.
- Attachment names are sanitized rather than rejected.
- Note ids and job ids accept only `[A-Za-z0-9._-]` because they become path segments.
