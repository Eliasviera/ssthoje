$ErrorActionPreference = "Stop"
$url = "http://localhost:3107/"
$appPath = Join-Path $PSScriptRoot "examples\app"

function Test-Panel {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
    return [int]$response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (Test-Panel) {
  Start-Process $url
  exit 0
}

if (-not (Test-Path (Join-Path $appPath "node_modules\next\dist\bin\next"))) {
  Write-Error "Dependências do painel não encontradas. Abra o projeto e instale as dependências primeiro."
  exit 1
}

$command = "cd /d `"$appPath`" & set PORT=3107 & node scripts/dev-with-postgres.mjs"
Start-Process -FilePath $env:ComSpec -ArgumentList @("/k", $command) -WorkingDirectory $appPath

for ($attempt = 0; $attempt -lt 60; $attempt++) {
  Start-Sleep -Seconds 2
  if (Test-Panel) {
    Start-Process $url
    exit 0
  }
}

Write-Error "O servidor não respondeu em http://localhost:3107/. Confira a janela do terminal e o PostgreSQL local."
exit 1
