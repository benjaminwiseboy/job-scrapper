# Installs the current Node.js LTS on Windows from the official MSI, after
# checking its SHA-256 against nodejs.org's published SHASUMS256.txt.
# Called by Installer.cmd once the user has agreed. -DryRun resolves the
# version, URL and expected checksum without downloading or installing.
param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
# Parentheses matter: Windows PowerShell 5.1 would otherwise pipe the whole
# JSON array as a single object.
$releases = (Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing)
$lts = $releases | Where-Object { $_.lts } | Select-Object -First 1
$version = $lts.version
$file = "node-$version-$arch.msi"
$base = "https://nodejs.org/dist/$version"

$sums = (Invoke-WebRequest -Uri "$base/SHASUMS256.txt" -UseBasicParsing).Content
if ($sums -is [byte[]]) { $sums = [Text.Encoding]::ASCII.GetString($sums) }
$line = $sums -split "`n" | Where-Object { $_.Trim().EndsWith("  $file") } | Select-Object -First 1
if (-not $line) { throw "Empreinte introuvable pour $file sur nodejs.org." }
$expected = ($line.Trim() -split '\s+')[0].ToLower()

Write-Host "Node.js $version ($arch) - $base/$file"
if ($DryRun) { Write-Host "[simulation] SHA-256 attendu : $expected"; exit 0 }

$msi = Join-Path $env:TEMP $file
Write-Host 'Téléchargement...'
Invoke-WebRequest -Uri "$base/$file" -OutFile $msi -UseBasicParsing
$actual = (Get-FileHash -Path $msi -Algorithm SHA256).Hash.ToLower()
if ($actual -ne $expected) {
  Remove-Item $msi -Force
  throw "Le fichier téléchargé ne correspond pas à l'empreinte publiée : installation annulée."
}

Write-Host 'Installation (Windows va demander une autorisation)...'
$p = Start-Process -FilePath 'msiexec.exe' -ArgumentList "/i `"$msi`" /passive /norestart" -Wait -PassThru
Remove-Item $msi -Force -ErrorAction SilentlyContinue
# 3010 = success, reboot suggested; Node works without it.
if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw "L'installeur de Node.js a échoué (code $($p.ExitCode))." }
Write-Host 'Node.js est installé.'
