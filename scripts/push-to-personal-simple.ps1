# Push to both remotes: personal (squash force) + origin/main (normal).
# Run from repo root:  cd C:\Projects\MNB\meetwise-ui-prototype   then   .\scripts\push-to-personal-simple.ps1
# Skip origin:  $env:SKIP_ORIGIN_PUSH = "1"

$repoRoot = $PSScriptRoot | Split-Path -Parent
Push-Location $repoRoot
if (-not (Test-Path .git)) {
  Pop-Location
  Write-Error "Not a git repo. Open PowerShell, run:  cd C:\Projects\MNB\meetwise-ui-prototype  then  .\scripts\push-to-personal-simple.ps1"
  exit 1
}

git stash push -m "push-personal" 2>$null
try {
  cmd /c "git checkout main"
  git branch -D _personal_push 2>$null
  git add -A
  cmd /c "git checkout --orphan _personal_push"
  git add -A
  cmd /c "git commit -m `"MeetWise UI prototype`""
  cmd /c "git push personal _personal_push:main --force"
  if ($LASTEXITCODE -ne 0) { throw "Push failed" }
  Write-Host "Personal repo updated." -ForegroundColor Green
} finally {
  cmd /c "git checkout main"
  git branch -D _personal_push 2>$null
  $remotes = @(git remote 2>$null)
  if ($remotes -contains "origin" -and $env:SKIP_ORIGIN_PUSH -ne "1") {
    cmd /c "git push origin main"
    if ($LASTEXITCODE -ne 0) { throw "git push origin main failed" }
    Write-Host "origin/main updated." -ForegroundColor Green
  }
  git stash pop 2>$null
  Pop-Location
}
