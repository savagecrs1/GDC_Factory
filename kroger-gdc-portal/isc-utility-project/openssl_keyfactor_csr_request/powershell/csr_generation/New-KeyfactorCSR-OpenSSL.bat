@ECHO OFF
:: TITLE: New-KeyfactorCSR-OpenSSL.bat
:: DESCRIPTION: Generates CSR + private key using OpenSSL.
::   Private key is output as newreq.key (portable for GCP, Linux, etc.)
::   Requires OpenSSL in PATH (e.g. Git for Windows: C:\Program Files\Git\usr\bin)
:: ----------------------------------------------------------------------------------
cd /d "%~dp0"

if not exist openssl.cnf (
    echo ERROR: openssl.cnf not found in current directory
    exit /b 1
)

where openssl >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: OpenSSL not found. Install Git for Windows or Win32 OpenSSL.
    exit /b 1
)

echo Generating private key and CSR...
openssl req -config openssl.cnf -new -newkey rsa:2048 -nodes -keyout newreq.key -out newreq.csr

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: OpenSSL failed
    exit /b 1
)

echo.
echo Success! Generated:
echo   newreq.key  - PRIVATE KEY (keep secure)
echo   newreq.csr  - CSR to submit to KeyFactor
echo.
echo Next: Submit newreq.csr via csr_enrollment, then save signed cert as newcert.pem
