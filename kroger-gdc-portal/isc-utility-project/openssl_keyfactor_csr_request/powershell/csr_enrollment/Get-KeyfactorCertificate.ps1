<#
TITLE: Get-KeyfactorCertificate.ps1
DESCRIPTION: Downloads a signed certificate from KeyFactor.
 NOTE: This script is for demonstration purposes. For information can be found on
 https://keyfactor.kroger.com/
* ------------------------------ CHANGE LOG ----------------------------------
* 04/12/22 SPREHER,ERIC - Created
******************************************************************************
#>
#### ENVIRONMENT VARIABLES ####
$CertID = "123456" #The Unique ID of the certificate. Provided as "CertID" in EnrollCSR response.
$CollectionId = "0" #The collection ID given to Infra/ServiceNow/VMT Group that owns the certificate
$CertificateFormat = "PEM" #Sets the type of file to download. Either PEM or DER
$IncludeChain = "false" #Includes the entire certificate trust chain if TRUE
# (Optional) Provide Credentials. By default, the script will attempt to use
#   the creditionals of the active account. If you wish to use different
#   remove the remark below to be prompted.
#$Credentials = Get-Credential

$KeyFactorAPI="https://keyfactor.kroger.com/KeyfactorAPI" #KeyFactor API Root URL

#### BEGIN SCRIPT ####
$headers = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
$headers.Add("X-Keyfactor-Requested-With", "APIClient")
$headers.Add("Content-Type", "application/json")
$headers.Add("X-CertificateFormat", $CertificateFormat)
$timesstamp = Get-Date (Get-Date).ToUniversalTime() -UFormat '+%Y-%m-%dT%H:%M:%S.000Z'
$body = @{
        CertID = $CertID
        IncludeChain = $IncludeChain
}
$body = $body | ConvertTo-Json
if ([string]::IsNullOrEmpty($Credentials)) {
    $certificateResponse = Invoke-RestMethod -Uri $KeyFactorAPI/Certificates/Download?collectionId=$CollectionId -Headers $headers -Method POST -Body $body -UseDefaultCredentials
} else {
    $certificateResponse = Invoke-RestMethod -Uri $KeyFactorAPI/Certificates/Download?collectionId=$CollectionId -Headers $headers -Method POST -Body $body -Credential $Credentials
}
$certificateResponse | ConvertTo-Json
# Collect the content, Base64 decode, an output to a file.
$Certificate = [System.Text.Encoding]::ASCII.GetString([System.Convert]::FromBase64String($certificateResponse.Content))
Write-Output $Certificate
$Certificate | Out-File newcert.cer
