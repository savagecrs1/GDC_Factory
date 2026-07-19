<#
TITLE: New-KeyfactorEnrollCSR.ps1
DESCRIPTION: Enrolls a new Certificate Signing Request (CSR) to be signed
 by a KeyFactor managed Certificate Authority (CA)
NOTE: This script is for demonstration purposes.
API docs: https://keyfactor.kroger.com/KeyfactorAPI/swagger/index.html
* ------------------------------ CHANGE LOG ----------------------------------
* 04/12/22 SPREHER,ERIC - Created
******************************************************************************
#>
param(
    # Use Windows integrated auth (Kerberos/NTLM). Try this if Basic auth returns 401.
    # Requires: domain-joined machine, on Kroger network/VPN.
    [switch]$UseWindowsAuth
)

#### ENVIRONMENT VARIABLES ####
$CSRFile = Join-Path $PSScriptRoot "..\csr_generation\newreq.csr" # CSR from csr_generation folder (iscpcc.gcp-internal.kroger.com)
$GroupName = "INF-InStoreCloud" # Infra/ServiceNow group (matches certreq.inf)
$Environment = "Production" # Production or Non-Production - adjust if iscpcc is Production
$CertificateAuthority = "N060CISPKI12.kroger.com\Kroger CA P2" #Certificate Authority Processing the Request
$CertificateTemplate = "KrogerWebServer(2048bit)1yr(SS)" ##Certificate Template being requested
# Auth: UseWindowsAuth uses current Windows identity. Otherwise Basic (KROGER\EUID + password).
# 401 with Basic? Try: .\New-KeyfactorEnrollCSR.ps1 -UseWindowsAuth
# 403 with Windows? Try: .\New-KeyfactorEnrollCSR.ps1  (prompts for KROGER\EUID)
if (-not $UseWindowsAuth) {
    $Credentials = Get-Credential -Message "Enter KROGER\EUID and password (or try UserPrincipalName: EUID@kroger.com)"
}

$KeyFactorAPI = "https://keyfactor.kroger.com/KeyfactorAPI" # Swagger: .../swagger/index.html

#### BEGIN SCRIPT ####
$headers = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
$headers.Add("X-Keyfactor-Requested-With", "APIClient")
$headers.Add("Content-Type", "application/json")
if ($UseWindowsAuth) {
    Write-Host "Using Windows integrated authentication..."
} else {
    $authPair = "$($Credentials.UserName):$($Credentials.GetNetworkCredential().Password)"
    $authBytes = [System.Text.Encoding]::ASCII.GetBytes($authPair)
    $headers.Add("Authorization", "Basic $([System.Convert]::ToBase64String($authBytes))")
}
$base64encodedCSR = (Get-Content $CSRFile -Raw) -replace "`r`n", "`n"
$timesstamp = Get-Date (Get-Date).ToUniversalTime() -UFormat '+%Y-%m-%dT%H:%M:%S.000Z'
$body = @{
        CSR = "$base64encodedCSR"
        CertificateAuthority = $CertificateAuthority
        IncludeChain = 'false'
        Template = $CertificateTemplate
        Timestamp = $timesstamp
        ### Including Body Example to had for additional SAN Data (If Not included in the CSR File) ###
        <# SANs = @{
            ## SAN DNS Value Examples
            DNS = @('hostname1.kroger.com','hostname2.kroger.com')
        }
        #>
        Metadata = @{
            Group = $GroupName
            Environment = $Environment
        }
}
$body = $body | ConvertTo-Json
$invokeParams = @{
    Uri     = "$KeyFactorAPI/Enrollment/CSR"
    Headers = $headers
    Method  = 'POST'
    Body    = $body
}
if ($UseWindowsAuth) { $invokeParams['UseDefaultCredentials'] = $true }
$certificateimportResponse = Invoke-RestMethod @invokeParams
$certificateimportResponse | ConvertTo-Json
# Collect the Keyfactor ID from the Certificate Information Response.
# You can use the ID to Download the certificate after approval.
$KeyfactorRequestId = $certificateimportResponse.CertificateInformation.KeyfactorRequestId
Write-Output "KeyfactorRequestId is $KeyfactorRequestId"
