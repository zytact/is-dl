# Resume pipeline

Select verbatim facts from YAML into a named one-page resume variant, render LaTeX, build a PDF, and check that expected text survives extraction.

## Sub-features

- Initialize the preamble, resume facts, and variants templates.
- Parse inline bold and link markup during schema loading.
- Select sections and tagged items for one or all variants.
- Check project structure without compiling.
- Build with Tectonic, reject more than one page, and run pdftotext extraction checks.
- Resolve input and output directories through flags, environment, config, and XDG defaults.

## How to get to it (user POV)

Run `is-dl resume init`, edit the three files under the reported input directory, then run `resume check` and `resume build --variant <name>`.

## Driving it with the CLI harness

```bash
D=.agents/skills/verify-is-dl/scripts/drive.sh

$D resume path --json >"$EV/resume-path.json"
$D resume init --json >"$EV/resume-init.json"
$D resume check --json >"$EV/resume-check.json"
$D resume build --variant default --json >"$EV/resume-build.json"
```

### Proof

Initialization creates `preamble.tex`, `resume.yaml`, and `variants.yaml` inside the isolated config root. Check reports the expected variant and item count. A full build reports one page, an extraction result with `ok: true`, and a PDF inside the isolated data root. `pdftotext` output contains the configured name and the selected content verbatim.

## Gotchas

- `resume check` needs no Tectonic. A PDF build needs both `tectonic` and `pdftotext`.
- The pipeline selects existing prose. It never writes or rewrites resume sentences.
- Invalid inline markup fails while loading YAML.
- Build output includes `.tex` and `.log` files. Preserve them with the PDF when diagnosing a failure.
