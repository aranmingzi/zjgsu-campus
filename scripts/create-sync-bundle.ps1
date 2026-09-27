param(
  [string]$OutputDirectory = "release",
  [string]$BundleName = "商砖小站-campus-full.bundle"
)

$ErrorActionPreference = "Stop"
$repoRoot = (& git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) {
  throw "当前目录不在 Git 仓库中。"
}

$releaseDirectory = Join-Path $repoRoot $OutputDirectory
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null

$bundlePath = Join-Path $releaseDirectory $BundleName
Push-Location $repoRoot
try {
  & git bundle create $bundlePath --all
  if ($LASTEXITCODE -ne 0) {
    throw "git bundle create 执行失败。"
  }

  & git bundle verify $bundlePath
  if ($LASTEXITCODE -ne 0) {
    throw "git bundle verify 校验失败。"
  }

  $hash = (Get-FileHash -LiteralPath $bundlePath -Algorithm SHA256).Hash
  $hashPath = "$bundlePath.sha256"
  Set-Content -LiteralPath $hashPath -Value "$hash *$BundleName" -Encoding ascii

  Write-Host ""
  Write-Host "完整仓库已生成：$bundlePath"
  Write-Host "SHA256：$hash"
  Write-Host "接收方执行："
  Write-Host "  git clone `"$bundlePath`" campus"
} finally {
  Pop-Location
}
