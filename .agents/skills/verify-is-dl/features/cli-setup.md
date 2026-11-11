# CLI setup and configuration

Inspect the packed CLI, resolve configuration, check dependencies, and manage the stored LinkedIn session.

## Sub-features

- Read help and the package version.
- Locate, read, and write user TOML configuration.
- Resolve flags over environment, project config, user config, and defaults; select saved search profiles.
- Check Node, Chromium, session-file presence, paths, Tectonic, and pdftotext with `doctor`.
- Store a LinkedIn session through an interactive login, reuse an existing session, and remove it with logout.
- Install a release with `install.sh`, move to a newer one with `update`, and see the once-a-day "Update available" notice on stderr.

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

## Installing and updating

`install.sh` and `update` write to `$HOME/.local/share/is-dl` and `$HOME/.local/bin`, so drive them with a scratch `HOME`, never the real one. Build a local release from this tree and serve it:

```bash
W=$PWD/.local/verify-is-dl-release; mkdir -p "$W/r1" "$W/home"
vp pm pack --pack-destination "$W" && mv "$W"/is-dl-*.tgz "$W/r1/is-dl.tgz"
cp install.sh "$W/r1/" && (cd "$W/r1" && sha256sum -- * >SHA256SUMS)
(cd "$W" && python3 -u -m http.server 0 --bind 127.0.0.1 >server.log 2>&1 & echo $! >server.pid)
until grep -q 'port [0-9]' "$W/server.log" 2>/dev/null; do sleep 0.2; done
U=http://127.0.0.1:$(grep -o 'port [0-9]*' "$W/server.log" | cut -d' ' -f2)
export PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright
HOME=$W/home IS_DL_RELEASE_URL=$U/r1 sh -c "curl -fsSL $U/r1/install.sh | sh"
```

For an update, extract `r1/is-dl.tgz`, raise the version in `package/package.json`, re-tar it as `r2/is-dl.tgz` with the `package/` prefix, and copy `install.sh` and regenerate `SHA256SUMS` beside it. Then run `HOME=$W/home IS_DL_RELEASE_URL=$U/r2 $W/home/.local/bin/is-dl update`. For the notice, write `{"latest":"<newer>"}` to `$W/home/.cache/is-dl/update-check.json` with an empty `update-claim-<days since epoch>` beside it, so no request reaches GitHub, and run `HOME=$W/home $W/home/.local/bin/is-dl --version` under a pseudo-terminal. Stop the server with `kill "$(cat "$W/server.pid")"` and delete `$W` afterwards.

### Proof

`~/.local/bin/is-dl` resolves through `current` to `versions/<v>/node_modules/is-dl/dist/cli.mjs`, and its Playwright is the version `package.json` pins. A rerun says "already up to date". After an update, `versions/` holds the new version and the one it replaced. A changed `SHA256SUMS` fails with "does not match the release checksum" and leaves `current` alone. The notice prints on a terminal and never with `--json` or a piped stderr.

## Gotchas

- `config set` writes the user file even when a project or explicit config file supplies the current read values.
- `--no-config` skips files, but environment overrides still apply.
- Login and doctor check session-file presence, not whether LinkedIn accepts the cookies. Existing login returns `status: "existing"` without opening a browser.
- A missing session in a noninteractive login returns exit 3. Replacing expired cookies requires `scripts/login.sh logout`, then `scripts/login.sh` in a real TTY. Use the persistent harness login, not the developer's ordinary session.
- Pointing `PLAYWRIGHT_BROWSERS_PATH` at the host registry keeps the installer from downloading Chromium into the scratch `HOME`. Playwright then removes host browsers that no installed Playwright uses.
- To verify logout without losing the persistent login, use a disposable `XDG_STATE_HOME` with the packed binary directly. Do not print or attach cookie contents.
