#!/bin/sh
# Installs or updates the is-dl CLI from a GitHub release.
# Set IS_DL_RELEASE_URL to a release's download URL to install that release instead of the latest.
set -eu

release_url="${IS_DL_RELEASE_URL:-https://github.com/zytact/is-dl/releases/latest/download}"
data_dir="${XDG_DATA_HOME:-$HOME/.local/share}/is-dl"
bin_dir="$HOME/.local/bin"

fail() {
  echo "is-dl: $1" >&2
  exit 1
}

for tool in node npm curl tar; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is required"
done
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' ||
  fail "is-dl needs Node.js 24+, but node is $(node --version)"
if command -v sha256sum >/dev/null 2>&1; then
  sha256='sha256sum'
else
  sha256='shasum -a 256'
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fsSL "$release_url/is-dl.tgz" -o "$tmp/is-dl.tgz"
curl -fsSL "$release_url/SHA256SUMS" -o "$tmp/SHA256SUMS"
(cd "$tmp" && grep '  is-dl.tgz$' SHA256SUMS | $sha256 -c - >/dev/null 2>&1) ||
  fail 'is-dl.tgz does not match the release checksum'

version="$(tar -xzOf "$tmp/is-dl.tgz" package/package.json |
  node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(0, "utf8")).version)')"
previous="$(readlink "$data_dir/current" 2>/dev/null || true)"
if [ "$previous" = "versions/$version" ]; then
  echo "is-dl $version is already up to date."
  exit 0
fi

# Install beside the current version, so a failed step leaves it in place.
staged="$tmp/$version"
echo "Installing is-dl $version..."
npm install --prefix "$staged" --omit=dev --no-fund --no-audit --loglevel=error "$tmp/is-dl.tgz" >/dev/null
"$staged/node_modules/.bin/playwright" install chromium ||
  fail 'could not install the Chromium build is-dl uses'

mkdir -p "$data_dir/versions" "$bin_dir"
rm -rf "$data_dir/versions/$version"
mv "$staged" "$data_dir/versions/$version"
ln -sfn "versions/$version" "$data_dir/current"
ln -sfn "$data_dir/current/node_modules/.bin/is-dl" "$bin_dir/is-dl"

# Keep the new version and the one it replaced.
for dir in "$data_dir"/versions/*; do
  name="versions/$(basename "$dir")"
  [ "$name" = "versions/$version" ] || [ "$name" = "$previous" ] || rm -rf "$dir"
done

echo "is-dl $version installed."
found="$(command -v is-dl || true)"
if [ -z "$found" ]; then
  echo "Add $bin_dir to PATH to run is-dl."
elif [ "$found" != "$bin_dir/is-dl" ]; then
  echo "Another is-dl at $found comes first on PATH. Remove it, for example with 'npm rm -g is-dl'."
fi
