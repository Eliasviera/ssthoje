$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $projectRoot "..\..\.env.pg.local"
$nodeRuntime = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$url = "http://127.0.0.1:3107/"
$healthUrl = "http://127.0.0.1:3107/api/health/db"

Set-Location -LiteralPath $projectRoot
$env:PORT = "3107"

if (Get-NetTCPConnection -LocalPort 3107 -State Listen -ErrorAction SilentlyContinue) {
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 4
    if ($health.status -eq "ok") {
      Start-Process $url
      Write-Host "O SST Hoje já estava iniciado. Abri o painel no navegador." -ForegroundColor Green
      exit 0
    }
  } catch {
    Write-Host "A porta 3107 já está ocupada, mas o painel não respondeu. Não encerrei nenhum processo." -ForegroundColor Yellow
    Write-Host "Feche a janela antiga do servidor e execute este atalho novamente."
    Read-Host "Pressione Enter para fechar"
    exit 1
  }
}

if (-not (Test-Path -LiteralPath $envFile)) {
  throw "Arquivo de configuração do banco não encontrado: $envFile"
}

Write-Host "Iniciando o PostgreSQL local..."
docker compose --env-file $envFile up -d db
if ($LASTEXITCODE -ne 0) { throw "O Docker não conseguiu iniciar o PostgreSQL." }

$databaseReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  docker compose --env-file $envFile exec -T db pg_isready *> $null
  if ($LASTEXITCODE -eq 0) {
    $databaseReady = $true
    break
  }
  Start-Sleep -Seconds 2
}
if (-not $databaseReady) { throw "O PostgreSQL não ficou pronto. Confira o Docker Desktop e tente novamente." }

if (-not (Test-Path -LiteralPath $nodeRuntime)) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) { $nodeRuntime = $node.Source }
  else { throw "Não encontrei o Node.js neste notebook." }
}

Write-Host "PostgreSQL pronto. Iniciando o painel em $url..." -ForegroundColor Green
& $nodeRuntime ".\scripts\dev-with-postgres.mjs"
