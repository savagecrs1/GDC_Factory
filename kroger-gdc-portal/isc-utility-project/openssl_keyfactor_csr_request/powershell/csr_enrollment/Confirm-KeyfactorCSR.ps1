<#
TITLE: Confirm-KeyFactorCSR.ps1
DESCRIPTION: Parses a CSR to ensure it was generated with proper information.
 NOTE: This script is for demonstration purposes. More information can be found on
 https://keyfactor.kroger.com/
* ------------------------------ CHANGE LOG ----------------------------------
* 04/22/2022 SPREHER,ERIC - Created
******************************************************************************
#>
#### ENVIRONMENT VARIABLES ####
$CSRFile = "c:\scripts\certificates\newreq.csr" #File Location/Name with the CSR (in Base64)
$KeyFactorAPI="https://keyfactor.kroger.com/KeyfactorAPI" #KeyFactor API Root URL
# (Optional) Provide Credentials. By default, the script will attempt to use
#   the creditionals of the active account. If you wish to use different
#   remove the remark below to be prompted.
#$Credentials = Get-Credential

#### BEGIN SCRIPT ####
$headers = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
$headers.Add("X-Keyfactor-Requested-With", "APIClient")
$headers.Add("Content-Type", "application/json")
$base64encodedCSR=Get-Content $CSRFile
$body = @{
    "csr" = "$base64encodedCSR"
}
$body = $body | ConvertTo-Json
# Check if creditionals are provided. If not, use active user.
if ([string]::IsNullOrEmpty($Credentials)) {
    $response = Invoke-RestMethod -Uri $KeyFactorAPI/Enrollment/CSR/Parse -Headers $headers -Method POST -Body $body -UseDefaultCredentials
} else {
    $response = Invoke-RestMethod -Uri $KeyFactorAPI/Enrollment/CSR/Parse -Headers $headers -Method POST -Body $body -Credential $Credentials
}
$response | ConvertTo-Json
Write-Output $response #Use Response to Validate CSR Contents
