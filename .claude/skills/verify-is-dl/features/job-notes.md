# Job notes

Keep markdown and binary attachments beside a job without tying them to an application record.

## Sub-features

- Add note text inline, from stdin, or from a file.
- Preserve the note body byte for byte.
- Fill company and role from a saved run.
- Edit body, title, or URL in place, preserving the note id, path, and creation date.
- Report unchanged edits without rewriting the file.
- List, show, locate, and remove notes.
- Copy attachments unchanged while sanitizing their names.
- Separate jobs by source when numeric ids collide.

## How to get to it (user POV)

Use a job id from a saved run and run `is-dl notes add <jobId>`. Notes may be created before applying. Attach a brief with `notes attach`.

## Driving it with the CLI harness

Use the launched session, `$EV`, and a nonempty saved Unstop search from the search recipe.

```bash
D=.agents/skills/verify-is-dl/scripts/drive.sh
JOB_ID="$(node -e 'const v=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(v.jobs[0].jobId)' "$EV/search.json")"
printf 'Hiring process\n\nTechnical screen first.  \n' >"$EV/note-input.md"
printf 'brief bytes\n' >"$EV/take home.txt"

$D notes add "$JOB_ID" --source unstop --file "$EV/note-input.md" --json >"$EV/note-add.json"
$D notes attach "$JOB_ID" --source unstop --file "$EV/take home.txt" --json >"$EV/note-attach.json"
$D notes show "$JOB_ID" --source unstop --json >"$EV/note-show.json"
NOTE_ID="$(node -e 'const v=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(v.note.noteId)' "$EV/note-add.json")"
$D notes edit "$JOB_ID" --source unstop --note "$NOTE_ID" --title 'After the call' --json >"$EV/note-title-edit.json"
$D notes edit "$JOB_ID" --source unstop --note "$NOTE_ID" --file "$EV/note-input.md" --json >"$EV/note-unchanged.json"
VISUAL='' EDITOR='sed -i s/first/next/' $D --tty notes edit "$JOB_ID" --source unstop --note "$NOTE_ID" --json >"$EV/note-editor.json"
$D notes show "$JOB_ID" --source unstop --note "$NOTE_ID" --json >"$EV/note-after.json"
```

### Proof

`note-show.json` reports the note and attachment under `unstop:jobId`. The note file body exactly matches `note-input.md`, including the trailing spaces and final newline. The attached file is named `take-home.txt`, and a byte comparison with the input succeeds.

The title edit keeps the body and file path. Repeating the original body returns `changed: false`. The TTY editor changes `first` to `next`, and the final note retains its id, path, creation date, and updated title.

## Gotchas

- The source, job id, and note id come from the path. Front matter does not carry identity.
- `notes add` needs a saved run unless `--source` supplies the board.
- A title or URL-only edit leaves the body alone. Otherwise `--text` or `--file` supplies the body, a pipe supplies stdin, or a TTY opens `VISUAL` before `EDITOR`.
- Use `drive.sh --tty` for full-session notes. `cli.sh --tty` uses separate CLI-only state. Python 3 and the chosen editor are prerequisites for the TTY recipe.
- Editing a job with multiple notes requires `--note <noteId>`.
- Attachment names are sanitized rather than rejected.
- Note ids and job ids accept only `[A-Za-z0-9._-]` because they become path segments.
