# CLI setup and configuration

Inspect the packed CLI, resolve configuration, check dependencies, and manage the stored LinkedIn session.

## Sub-features

- Read help and the package version.
- Locate, read, and write user TOML configuration.
- Resolve flags over environment, project config, user config, and defaults; select saved search profiles.
- Check Node, Chromium, session-file presence, paths, Tectonic, and pdftotext with `doctor`.
- Store a LinkedIn session through an interactive login, reuse an existing session, and remove it with logout.

## How to get to it (user POV)

Use `is-dl config path`, `config get`, and `config set <key> <value>`. Run `is-dl doctor --json` for dependency checks. A new LinkedIn login requires installed Playwright Chromium, a real terminal, and a person completing the browser sign-in.

## Driving it with the CLI harness

After launch and a passing harness doctor, use the shared isolated session:

```bash
D=.agents/skills/verify-is-dl/scripts/drive.sh

$D --version >"$EV/version.txt"
$D --help >"$EV/help.txt"
$D config path --json >"$EV/config-path.json"
$D config set limit 2 --json >"$EV/config-set.json"
$D config get limit --json >"$EV/config-get.json"
IS_DL_LIMIT=3 $D config get limit --json >"$EV/config-env.json"
$D doctor --json >"$EV/product-doctor.json"
$D config set limit 50 --json >"$EV/config-restore.json"
```

### Proof

The version matches package.json. Config paths and the written TOML stay under the isolated config root. The stored limit is 2, and the environment override resolves to 3. Restore the default limit before later searches. Inspect every doctor check: a missing optional session or resume dependency can make product doctor fail even when the harness and Unstop work.

## Gotchas

- `config set` writes the user file even when a project or explicit config file supplies the current read values.
- `--no-config` skips files, but environment overrides still apply.
- Login and doctor check session-file presence, not whether LinkedIn accepts the cookies. Existing login returns `status: "existing"` without opening a browser.
- A missing session in a noninteractive login returns exit 3. Replacing expired cookies requires `scripts/login.sh logout`, then `scripts/login.sh` in a real TTY. Use the persistent harness login, not the developer's ordinary session.
- To verify logout without losing the persistent login, use a disposable `XDG_STATE_HOME` with the packed binary directly. Do not print or attach cookie contents.
