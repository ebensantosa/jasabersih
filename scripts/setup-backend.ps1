# JasaBersih backend setup — run sekali untuk init Postgres + Redis + migrate + seed
# Usage: .\scripts\setup-backend.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

Write-Host "[1/5] Bring up Docker (Postgres + Redis + MinIO)..." -ForegroundColor Cyan
docker compose -f docker/docker-compose.dev.yml up -d
if ($LASTEXITCODE -ne 0) { throw "Docker up gagal. Pastikan Docker Desktop running." }

Write-Host "[2/5] Tunggu Postgres siap..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

Write-Host "[3/5] Setup .env API kalau belum..." -ForegroundColor Cyan
if (-not (Test-Path "apps/api/.env")) {
    Copy-Item "apps/api/.env.example" "apps/api/.env"
    # Generate random JWT secrets
    $access = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 }))
    $refresh = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 }))
    (Get-Content "apps/api/.env") -replace 'JWT_ACCESS_SECRET=.*', "JWT_ACCESS_SECRET=$access" -replace 'JWT_REFRESH_SECRET=.*', "JWT_REFRESH_SECRET=$refresh" | Set-Content "apps/api/.env"
    Write-Host "    .env dibuat dengan random JWT secrets." -ForegroundColor Green
}

Write-Host "[4/5] Generate Prisma client..." -ForegroundColor Cyan
Set-Location apps/api
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate gagal." }

Write-Host "[5/5] Apply migrations + seed..." -ForegroundColor Cyan
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "migrate gagal." }
npx tsx prisma/seed.ts
if ($LASTEXITCODE -ne 0) { throw "seed gagal." }

Set-Location ..\..

Write-Host ""
Write-Host "DONE. Sekarang:" -ForegroundColor Green
Write-Host "  Terminal 1:  npm run dev -w @jasabersih/api      # http://localhost:3000" -ForegroundColor Yellow
Write-Host "  Terminal 2:  npm run dev -w @jasabersih/admin    # http://localhost:3001" -ForegroundColor Yellow
Write-Host "  Terminal 3:  npm run start -w @jasabersih/mobile # Expo" -ForegroundColor Yellow
Write-Host ""
Write-Host "Admin login: admin@jasabersih.com / admin123" -ForegroundColor Cyan
