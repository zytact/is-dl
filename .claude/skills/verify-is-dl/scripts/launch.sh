#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../../.." && pwd)"
run="$repo/.local/verify-is-dl"
# The LinkedIn session lives here and survives cleanup, so one login serves
# every later run. IS_DL_VERIFY_LOGIN_DIR points at a second account's login.
login="${IS_DL_VERIFY_LOGIN_DIR:-$repo/.local/verify-is-dl-login}"
session="$run/session.env"
profile="$run/browser-profile"
downloads="$run/downloads"
evidence_root="$repo/.local/verify-evidence/is-dl"
api_port=3000
web_port=5173
api_pid=""
web_pid=""
browser_pid=""
cdp_port=""

stop_group() {
  local pid="$1"
  [[ -n "$pid" ]] || return
  kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
}

stop_partial() {
  [[ -n "$cdp_port" ]] && node "$here/browser.mjs" --port "$cdp_port" close >/dev/null 2>&1 || true
  stop_group "$browser_pid"
  stop_group "$web_pid"
  stop_group "$api_pid"
  rm -rf -- "$run"
}

fail() {
  echo "$1" >&2
  stop_partial
  exit 1
}

if [[ -f "$session" ]]; then
  echo "A verification session already exists at $session." >&2
  echo "Run scripts/cleanup.sh before launching another one." >&2
  exit 2
fi

for port in "$api_port" "$web_port"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | grep -q .; then
    echo "Port $port already has a listener. Stop it before verification." >&2
    exit 2
  fi
done

command -v vp >/dev/null 2>&1 || { echo "Vite+ is required." >&2; exit 4; }
command -v tmux >/dev/null 2>&1 || { echo "tmux is required for the TUI." >&2; exit 4; }

browser="${IS_DL_VERIFY_BROWSER:-}"
if [[ -z "$browser" ]]; then
  for candidate in chromium chromium-browser helium google-chrome google-chrome-stable; do
    if command -v "$candidate" >/dev/null 2>&1; then
      browser="$(command -v "$candidate")"
      break
    fi
  done
fi
[[ -n "$browser" ]] || { echo "No Chromium browser found. Set IS_DL_VERIFY_BROWSER." >&2; exit 4; }

free_port() {
  node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})'
}
cdp_port="$(free_port)"

cd "$repo"
vp run build

mkdir -p "$run/config" "$run/data" "$run/cache" \
  "$run/tui-work" "$profile/Default" "$downloads" "$evidence_root" "$login/state"

bin="$repo/dist/cli.mjs"
tui_bin="$repo/apps/tui/bin/is-dl-tui"

# Every chunk, not just cli.mjs. Commands are dynamic imports, so a change to
# one of them leaves the entry file byte-identical.
dist_sha() {
  node -e '
const {createHash}=require("node:crypto");
const {readdirSync,readFileSync}=require("node:fs");
const {join}=require("node:path");
const dir=process.argv[1];
const h=createHash("sha256");
for (const name of readdirSync(dir).filter((n)=>n.endsWith(".mjs")).sort()) {
  h.update(name);
  h.update(readFileSync(join(dir,name)));
}
process.stdout.write(h.digest("hex"));' "$1" 2>/dev/null
}
build_sha="$(dist_sha "$repo/dist")"
tui_sha="$(node -e 'const{createHash}=require("node:crypto"),{readFileSync}=require("node:fs");process.stdout.write(createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"))' "$tui_bin")"

# Playwright resolves its browser registry through XDG_CACHE_HOME on Linux, so
# isolating the cache hides the Chromium the developer already installed and
# every LinkedIn proof fails as a missing dependency. Pin the registry to the
# host's before the cache moves. is-dl's own cache stays isolated.
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright}"

export XDG_CONFIG_HOME="$run/config"
export XDG_DATA_HOME="$run/data"
export XDG_STATE_HOME="$login/state"
export XDG_CACHE_HOME="$run/cache"

setsid "$bin" serve --host 127.0.0.1 --port "$api_port" >"$run/api.log" 2>&1 &
api_pid=$!

setsid bash -c '
  cd "$1/apps/web"
  exec node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port "$2" --strictPort
' _ "$repo" "$web_port" >"$run/web.log" 2>&1 &
web_pid=$!

for _ in {1..60}; do
  curl -fsS "http://127.0.0.1:$api_port/api/results" >/dev/null 2>&1 && break
  kill -0 "$api_pid" 2>/dev/null || fail "The API exited. See $run/api.log"
  sleep 0.25
done
curl -fsS "http://127.0.0.1:$api_port/api/results" >/dev/null 2>&1 || fail "The API was not ready in 15 seconds."

for _ in {1..60}; do
  curl -fsS "http://127.0.0.1:$web_port/" >/dev/null 2>&1 && break
  kill -0 "$web_pid" 2>/dev/null || fail "The website exited. See $run/web.log"
  sleep 0.25
done
curl -fsS "http://127.0.0.1:$web_port/" >/dev/null 2>&1 || fail "The website was not ready in 15 seconds."

node -e '
const {readFileSync,writeFileSync}=require("node:fs");
const [file,dir]=process.argv.slice(1);let prefs={};
try{prefs=JSON.parse(readFileSync(file,"utf8"))}catch{}
prefs.download={...prefs.download,default_directory:dir,prompt_for_download:false};
prefs.savefile={...prefs.savefile,default_directory:dir};
writeFileSync(file,JSON.stringify(prefs));
' "$profile/Default/Preferences" "$downloads"

setsid "$browser" \
  --user-data-dir="$profile" \
  --remote-debugging-port="$cdp_port" \
  --headless=new \
  --no-first-run \
  --no-default-browser-check \
  --disable-search-engine-choice-screen \
  --hide-crash-restore-bubble \
  --window-size=1440,1000 \
  "http://127.0.0.1:$web_port/" \
  >"$run/browser.log" 2>&1 &
browser_pid=$!

for _ in {1..120}; do
  curl -fsS "http://127.0.0.1:$cdp_port/json/version" >/dev/null 2>&1 && break
  kill -0 "$browser_pid" 2>/dev/null || fail "The browser exited. See $run/browser.log"
  sleep 0.25
done
curl -fsS "http://127.0.0.1:$cdp_port/json/version" >/dev/null 2>&1 || fail "The browser CDP port was not ready in 30 seconds."

for _ in {1..120}; do
  hydrated="$(node "$here/browser.mjs" --port "$cdp_port" eval "127.0.0.1:$web_port" 'Object.keys(document.getElementById("root")).some((key)=>key.startsWith("__reactContainer$"))' 2>/dev/null || true)"
  [[ "$hydrated" == "true" ]] && break
  sleep 0.25
done
[[ "$hydrated" == "true" ]] || fail "The website never hydrated. See $run/browser.log"

{
  printf 'export IS_DL_VERIFY_REPO=%q\n' "$repo"
  printf 'export IS_DL_VERIFY_DIR=%q\n' "$run"
  printf 'export IS_DL_VERIFY_LOGIN_DIR=%q\n' "$login"
  printf 'export IS_DL_VERIFY_SESSION_FILE=%q\n' "$login/state/is-dl/storageState.json"
  printf 'export IS_DL_VERIFY_BIN=%q\n' "$bin"
  printf 'export IS_DL_VERIFY_TUI_BIN=%q\n' "$tui_bin"
  printf 'export IS_DL_VERIFY_BUILD_SHA=%q\n' "$build_sha"
  printf 'export IS_DL_VERIFY_TUI_SHA=%q\n' "$tui_sha"
  printf 'export IS_DL_VERIFY_API_PID=%q\n' "$api_pid"
  printf 'export IS_DL_VERIFY_WEB_PID=%q\n' "$web_pid"
  printf 'export IS_DL_VERIFY_BROWSER_PID=%q\n' "$browser_pid"
  printf 'export IS_DL_VERIFY_BROWSER_BIN=%q\n' "$browser"
  printf 'export IS_DL_VERIFY_CDP_PORT=%q\n' "$cdp_port"
  printf 'export IS_DL_VERIFY_API_PORT=%q\n' "$api_port"
  printf 'export IS_DL_VERIFY_WEB_PORT=%q\n' "$web_port"
  printf 'export IS_DL_VERIFY_API_URL=%q\n' "http://127.0.0.1:$api_port"
  printf 'export IS_DL_VERIFY_WEB_URL=%q\n' "http://127.0.0.1:$web_port"
  printf 'export IS_DL_VERIFY_PROFILE=%q\n' "$profile"
  printf 'export IS_DL_VERIFY_DOWNLOADS=%q\n' "$downloads"
  printf 'export IS_DL_VERIFY_TMUX=%q\n' "is-dl-verify-$api_pid"
  printf 'export IS_DL_VERIFY_EVIDENCE_ROOT=%q\n' "$evidence_root"
  printf 'export XDG_CONFIG_HOME=%q\n' "$XDG_CONFIG_HOME"
  printf 'export XDG_DATA_HOME=%q\n' "$XDG_DATA_HOME"
  printf 'export XDG_STATE_HOME=%q\n' "$XDG_STATE_HOME"
  printf 'export XDG_CACHE_HOME=%q\n' "$XDG_CACHE_HOME"
  printf 'export PLAYWRIGHT_BROWSERS_PATH=%q\n' "$PLAYWRIGHT_BROWSERS_PATH"
} >"$session"

"$here/doctor.sh"
printf '\nWebsite: http://127.0.0.1:%s\n' "$web_port"
printf 'API: http://127.0.0.1:%s\n' "$api_port"
printf 'Evidence: %s\n' "$evidence_root"
if [[ -f "$login/state/is-dl/storageState.json" ]]; then
  printf 'LinkedIn: stored session reused from %s\n' "$login"
else
  printf 'LinkedIn: no stored session. Run scripts/login.sh once in a TTY.\n'
fi
