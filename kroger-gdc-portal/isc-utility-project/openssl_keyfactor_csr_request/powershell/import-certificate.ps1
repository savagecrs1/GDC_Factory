<#
TITLE: Import-KeyfactorCertificate.ps1
DESCRIPTION: Imports a predefined certificate into the KeyFactor System
PREREQUISITES: Active Directory Account with KeyFactor Privileges
* ------------------------------ CHANGE LOG ----------------------------------
* 04/28/22 SPREHER,ERIC - Created
******************************************************************************
#>
param(
     [Parameter()]
     [string]$Parameter1
)

#Environment Variables
$GroupName="GroupName" # The name of Infra/ServiceNow/VMT Group that Owns the certificate -i.e. INF-CISSystems
$Environment="Production" # The type of envrionment the certificate is hosted on

$KeyFactorAPI="https://keyfactor.kroger.com/KeyfactorAPI" #KeyFactor API Root URL

$base64encodedcertificate=Get-Content "$Parameter1" #Certificate File collected from script parameter
$body = @{
        Certificate = "$base64encodedcertificate"
        Metadata = @{
            Group = "$GroupName"
            Environment = "$Environment"
        }
}
$body = $body | ConvertTo-Json

$headers = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
$headers.Add("x-keyfactor-requested-with", "APIClient")
$headers.Add("Content-Type", "application/json")

$response = Invoke-RestMethod -Uri $KeyFactorAPI/Certificates/Import -Method POST -Headers $headers -Body $body -UseDefaultCredentials
$response | ConvertTo-Json
Write-Output $response
