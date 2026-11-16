# Installs or updates the is-dl CLI from a GitHub release on Windows.
# Set IS_DL_RELEASE_URL to a release's download URL to install that release instead of the latest.
# Runs under Windows PowerShell 5.1 and PowerShell 7, from a file or through `irm | iex`.

function Install-IsDl {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'

  $releaseUrl = if ($env:IS_DL_RELEASE_URL) { $env:IS_DL_RELEASE_URL } else { 'https://github.com/zytact/is-dl/releases/latest/download' }
  $dataDir = Join-Path $env:LOCALAPPDATA 'is-dl'
  $versionsDir = Join-Path $dataDir 'versions'
  $current = Join-Path $dataDir 'current'
  $binDir = Join-Path $env:USERPROFILE '.local\bin'
  # Git's tar reads C:\ as a remote host, so use the one Windows ships.
  $tar = Join-Path $env:SystemRoot 'System32\tar.exe'

  foreach ($tool in 'node', 'npm') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "is-dl: $tool is required" }
  }
  if (-not (Test-Path $tar)) { throw "is-dl: $tar is required" }
  $nodeVersion = node --version
  if ([int]$nodeVersion.TrimStart('v').Split('.')[0] -lt 24) {
    throw "is-dl: is-dl needs Node.js 24+, but node is $nodeVersion"
  }

  New-Item -ItemType Directory -Force $versionsDir, $binDir | Out-Null
  # An install killed mid-way, as `is-dl update` is on Ctrl+C, never reaches its cleanup.
  Get-ChildItem -Force $dataDir -Filter '.install.*' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  $tmp = Join-Path $dataDir ".install.$([guid]::NewGuid().ToString('N').Substring(0, 6))"
  New-Item -ItemType Directory $tmp | Out-Null
  try {
    $tarball = Join-Path $tmp 'is-dl.tgz'
    Invoke-WebRequest -UseBasicParsing "$releaseUrl/is-dl.tgz" -OutFile $tarball
    $sums = Join-Path $tmp 'SHA256SUMS'
    Invoke-WebRequest -UseBasicParsing "$releaseUrl/SHA256SUMS" -OutFile $sums
    # Like `sha256sum -c`, accept both the text and the binary mode line.
    $expected = foreach ($line in Get-Content $sums) {
      if ($line -match '^([0-9a-f]{64}) [ *]is-dl\.tgz$') { $Matches[1] }
    }
    if (-not $expected -or (Get-FileHash -Algorithm SHA256 $tarball).Hash -ne $expected) {
      throw 'is-dl: is-dl.tgz does not match the release checksum'
    }

    $version = ((& $tar -xzOf $tarball package/package.json) -join "`n" | ConvertFrom-Json).version
    $currentItem = Get-Item -Force $current -ErrorAction SilentlyContinue
    $previous = if ($currentItem) { Split-Path -Leaf @($currentItem.Target)[0] }
    if ($previous -eq $version -and (Test-Path (Join-Path $current 'node_modules\.bin\is-dl.cmd'))) {
      Write-Shims $binDir $current
      Write-Output "is-dl $version is already up to date."
      Write-PathAdvice $binDir
      return
    }

    $staged = Join-Path $tmp $version
    Write-Output "Installing is-dl $version..."
    # Through cmd, because PowerShell prefers npm.ps1, which the default execution policy blocks.
    cmd /d /c npm install --prefix $staged --omit=dev --no-fund --no-audit --no-update-notifier --loglevel=error $tarball | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "is-dl: npm could not install is-dl $version" }
    & (Join-Path $staged 'node_modules\.bin\playwright.cmd') install chromium
    if ($LASTEXITCODE -ne 0) { throw 'is-dl: could not install the Chromium build is-dl uses' }

    $target = Join-Path $versionsDir $version
    if (Test-Path $target) { Remove-Item -Recurse -Force $target }
    Move-Item $staged $target
    # Deleting the directory entry removes only the junction, never the version it points to.
    if ($currentItem) { [IO.Directory]::Delete($current) }
    New-Item -ItemType Junction -Path $current -Target $target | Out-Null
    Write-Shims $binDir $current

    # A version still in use, such as a running `is-dl serve`, stays until a later install.
    Get-ChildItem $versionsDir | Where-Object { $_.Name -ne $version -and $_.Name -ne $previous } |
      Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }

  Write-Output "is-dl $version installed."
  Write-PathAdvice $binDir
}

# Says how to put $binDir on PATH, or which directory ahead of it holds another is-dl. PowerShell
# runs the first is-dl.cmd, .ps1 or .exe on PATH, and Git Bash the first is-dl or is-dl.exe.
function Write-PathAdvice([string]$binDir) {
  $onPath = $false
  $ahead = foreach ($dir in $env:Path -split ';') {
    $dir = $dir.Trim().Trim('"').TrimEnd('\')
    if ($dir -eq $binDir) { $onPath = $true; break }
    # File.Exists returns false on a malformed PATH entry, where Test-Path in PowerShell 5.1 throws.
    if ($dir -and ('is-dl', 'is-dl.cmd', 'is-dl.ps1', 'is-dl.exe' | Where-Object { [IO.File]::Exists("$dir\$_") })) { $dir }
  }
  if (-not $onPath) {
    Write-Output "Add $binDir to PATH to run is-dl. In PowerShell:"
    Write-Output "  [Environment]::SetEnvironmentVariable('Path', `"$binDir;`" + [Environment]::GetEnvironmentVariable('Path', 'User'), 'User')"
  }
  foreach ($dir in $ahead) {
    Write-Output "Another is-dl in $dir may run instead of this one. Remove it with 'vp remove -g is-dl' or 'npm rm -g is-dl' if one of them installed it, or take $dir off PATH."
  }
}

# Writes is-dl.cmd for PowerShell and cmd, and an extensionless is-dl for Git Bash, which never runs
# a .cmd. cmd.exe rereads a running batch file, and `is-dl update` can run through is-dl.cmd, so the
# shims stay the same across versions and each is written only when it changes.
function Write-Shims([string]$binDir, [string]$current) {
  $package = Get-Content -Raw (Join-Path $current 'node_modules\is-dl\package.json') | ConvertFrom-Json
  $bin = $package.bin.'is-dl' -replace '^\./', ''
  $shims = @{
    'is-dl.cmd' = "@node `"%LOCALAPPDATA%\is-dl\current\node_modules\is-dl\$($bin -replace '/', '\')`" %*`r`n"
    'is-dl' = "#!/bin/sh`nexec node `"`$LOCALAPPDATA/is-dl/current/node_modules/is-dl/$bin`" `"`$@`"`n"
  }
  foreach ($name in $shims.Keys) {
    $shim = Join-Path $binDir $name
    if ((Test-Path $shim) -and (Get-Content -Raw $shim) -ceq $shims[$name]) { continue }
    # WriteAllText adds no BOM. sh would read one as part of the #! line.
    [IO.File]::WriteAllText($shim, $shims[$name])
  }
}

Install-IsDl
