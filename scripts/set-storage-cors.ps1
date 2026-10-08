# One-time setup for step 7: allows https://ailaxx.com to upload to the
# private Neon storage bucket. Run from the repository root:
#   pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\set-storage-cors.ps1
# Paste the values from Neon Console > Connect > Storage (Parameters only).
# Nothing you paste is shown or saved.

$ErrorActionPreference = 'Stop'

$env:STORAGE_ACCESS_KEY_ID = Read-Host 'Paste AWS_ACCESS_KEY_ID (nak_live_...)' -MaskInput
$env:STORAGE_SECRET_ACCESS_KEY = Read-Host 'Paste AWS_SECRET_ACCESS_KEY (nsk_live_...)' -MaskInput

try {
  node scripts/set-storage-cors.mjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Remove-Item Env:STORAGE_ACCESS_KEY_ID, Env:STORAGE_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
}
