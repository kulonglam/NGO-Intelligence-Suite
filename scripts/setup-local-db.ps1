#requires -Version 5.1
<#
.SYNOPSIS
  Creates the local ngois database and role on an existing PostgreSQL instance.

.EXAMPLE
  $env:PGPASSWORD = 'your-postgres-password'
  .\scripts\setup-local-db.ps1
#>

param(
  [string]$SuperUser = 'postgres',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 5432,
  [string]$AppUser = 'ngois',
  [string]$AppPassword = 'ngois_dev',
  [string]$Database = 'ngois'
)

$ErrorActionPreference = 'Stop'
$env:Path = "C:\Program Files\PostgreSQL\18\bin;C:\Program Files\PostgreSQL\17\bin;C:\Program Files\PostgreSQL\16\bin;C:\Program Files\PostgreSQL\15\bin;" + $env:Path

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw 'psql not found. Install PostgreSQL or add its bin directory to PATH.'
}

if (-not $env:PGPASSWORD) {
  Write-Host 'Set PGPASSWORD to the postgres superuser password, then re-run.' -ForegroundColor Yellow
  Write-Host '  $env:PGPASSWORD = ''your-password'''
  Write-Host '  .\scripts\setup-local-db.ps1'
  exit 1
}

$psql = { param($sql) & psql -h $HostName -p $Port -U $SuperUser -d postgres -v ON_ERROR_STOP=1 -c $sql }

Write-Host "Creating role/database on ${HostName}:${Port}..."
& $psql "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$AppUser') THEN CREATE ROLE $AppUser LOGIN PASSWORD '$AppPassword'; END IF; END `$`$;"
& $psql "SELECT 'CREATE DATABASE $Database OWNER $AppUser' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$Database')\gexec"
& $psql "GRANT ALL PRIVILEGES ON DATABASE $Database TO $AppUser;"

Write-Host "OK. Next:" -ForegroundColor Green
Write-Host "  `$env:DATABASE_URL = 'postgres://${AppUser}:${AppPassword}@${HostName}:${Port}/${Database}'"
Write-Host "  npm run db:migrate"
Write-Host "  npm run db:seed"
