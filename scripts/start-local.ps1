# Запуск бота локально: ждёт движок Docker, поднимает Postgres+Redis,
# накатывает миграции и стартует бота в watch-режиме.
# Использование (после старта Docker Desktop):  npm run start:local
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host '⏳ Жду движок Docker...' -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  docker info *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 5
}
if (-not $ready) { Write-Error 'Движок Docker не готов. Запусти Docker Desktop и дождись «Engine running».'; exit 1 }

Write-Host '🐘 Поднимаю Postgres + Redis...' -ForegroundColor Cyan
docker compose up -d postgres redis

Write-Host '⏳ Жду готовности Postgres...' -ForegroundColor Cyan
for ($i = 0; $i -lt 40; $i++) {
  $h = docker inspect -f '{{.State.Health.Status}}' tba_postgres 2>$null
  if ($h -eq 'healthy') { break }
  Start-Sleep -Seconds 3
}

Write-Host '🗄  Применяю миграции...' -ForegroundColor Cyan
npx prisma migrate deploy

Write-Host '🎂 Запускаю бота...' -ForegroundColor Green
npm run start:dev
