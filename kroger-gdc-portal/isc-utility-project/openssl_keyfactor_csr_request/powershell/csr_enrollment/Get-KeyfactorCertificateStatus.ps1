<#
TITLE: Get-KeyfactorCertificateStatus.ps1
DESCRIPTION: Determine if a certificate has been signed or still pending approval
 in the workflow.
 NOTE: This script is for demonstration purposes. For information can be found on
 https://keyfactor.kroger.com/
* ------------------------------ CHANGE LOG ----------------------------------
* 12/27/22 SPREHER,ERIC - Created
******************************************************************************
#>
#### ENVIRONMENT VARIABLES ####
$CertID = 123456 #The Keyfactor ID Provided from the CSR Enrollment Response. (i.e. The response from the New-KeyfactorEnrollCSR.ps1 script.)

# (Optional) Provide Credentials. By default, the script will attempt to use
#   the creditionals of the active account. If you wish to use different
#   remove the remark below to be prompted.
$Credentials = Get-Credential

$KeyFactorAPI="https://keyfactor.kroger.com/KeyfactorAPI" #KeyFactor API Root URL

#### BEGIN SCRIPT ####
$headers = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
$headers.Add("X-Keyfactor-Requested-With", "APIClient")
$headers.Add("Content-Type", "application/json")
$timesstamp = Get-Date (Get-Date).ToUniversalTime() -UFormat '+%Y-%m-%dT%H:%M:%S.000Z'
$body = $body | ConvertTo-Json
if ([string]::IsNullOrEmpty($Credentials)) {
    $certificateStatusResponse = Invoke-RestMethod -Uri $KeyFactorAPI/Workflow/Certificates/$CertID -Headers $headers -Method GET -UseDefaultCredentials
} else {
    $certificateStatusResponse = Invoke-RestMethod -Uri $KeyFactorAPI/Workflow/Certificates/$CertID -Headers $headers -Method GET -Credential $Credentials
}
$certificateStatusResponse =  $certificateStatusResponse | ConvertFrom-Json
Write-Output $certificateStatusResponse
switch ($certificateStatusResponse.State) {
    5 {
        Write-Host "Request is still pending approval."
        Break
    }
    1 {
        Write-Host "Certificate is active and ready for download."
        Break
    }
    default {
        Write-Host "Unable to retrieve certificate status."
    }
}
