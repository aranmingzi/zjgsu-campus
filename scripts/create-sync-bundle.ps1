param(
  [string]$OutputDirectory = "release",
  [string]$BundleName = "zjgsu-campus-full.bundle"
)

$ErrorActionPreference = "Stop"
$repoRoot = (& git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) {
  throw "The current directory is not inside a Git repository."
}

$releaseDirectory = Join-Path $repoRoot $OutputDirectory
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null

$bundlePath = Join-Path $releaseDirectory $BundleName
Push-Location $repoRoot
try {
  & git bundle create $bundlePath --all
  if ($LASTEXITCODE -ne 0) {
    throw "git bundle create failed."
  }

  & git bundle verify $bundlePath
  if ($LASTEXITCODE -ne 0) {
    throw "git bundle verify failed."
  }

  $hash = (Get-FileHash -LiteralPath $bundlePath -Algorithm SHA256).Hash
  $hashPath = "$bundlePath.sha256"
  Set-Content -LiteralPath $hashPath -Value "$hash *$BundleName" -Encoding ascii

  Write-Host ""
  Write-Host "Full repository bundle created: $bundlePath"
  Write-Host "SHA256: $hash"
  Write-Host "Recipient command:"
  Write-Host "  git clone `"$bundlePath`" campus"
} finally {
  Pop-Location
}
