<#
.SYNOPSIS
    Generates a CSR and private key using OpenSSL (private key as file).
.DESCRIPTION
    Unlike certreq, OpenSSL outputs the private key as a file, making it portable
    for use on GCP, Linux, or other environments.
    Requires OpenSSL (e.g. from Git for Windows or Win32 OpenSSL).
.NOTES
    Output: newreq.key (private key), newreq.csr (CSR to submit to KeyFactor)
    KEEP newreq.key SECURE - do not commit to git.
#>
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$OpenSSLConfig = Join-Path $ScriptDir "openssl.cnf"
$KeyFile       = Join-Path $ScriptDir "newreq.key"
$CsrFile       = Join-Path $ScriptDir "newreq.csr"

if (-not (Test-Path $OpenSSLConfig)) {
    Write-Error "openssl.cnf not found at $OpenSSLConfig"
}

# Check OpenSSL availability
$openssl = Get-Command openssl -ErrorAction SilentlyContinue
if (-not $openssl) {
    Write-Error "OpenSSL not found. Install Git for Windows or Win32 OpenSSL and add to PATH."
}

Write-Host "Generating private key and CSR..." -ForegroundColor Cyan
openssl req -config $OpenSSLConfig -new -newkey rsa:2048 -nodes -keyout $KeyFile -out $CsrFile

if ($LASTEXITCODE -ne 0) {
    Write-Error "OpenSSL failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "Success! Generated:" -ForegroundColor Green
Write-Host "  newreq.key  - PRIVATE KEY (keep secure, do not share)" -ForegroundColor Yellow
Write-Host "  newreq.csr  - CSR to submit to KeyFactor" -ForegroundColor Green
Write-Host ""
Write-Host "Next: Submit newreq.csr via csr_enrollment scripts or Postman." -ForegroundColor Cyan
Write-Host "      Save the signed certificate as newcert.pem alongside newreq.key." -ForegroundColor Cyan
