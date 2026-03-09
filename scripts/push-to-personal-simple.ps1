# Update your personal GitHub.
# Run from repo root:  cd C:\Projects\MNB\meetwise-ui-prototype   then   .\scripts\push-to-personal-simple.ps1

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
  cmd /c "git branch -D _personal_push"
  git add -A
  cmd /c "git checkout --orphan _personal_push"
  git add -A
  cmd /c "git commit -m `"MeetWise UI prototype`""
  cmd /c "git push personal _personal_push:main --force"
  if ($LASTEXITCODE -ne 0) { throw "Push failed" }
  Write-Host "Personal repo updated." -ForegroundColor Green
} finally {
  cmd /c "git checkout main"
  cmd /c "git branch -D _personal_push"
  git stash pop 2>$null
  Pop-Location
}
