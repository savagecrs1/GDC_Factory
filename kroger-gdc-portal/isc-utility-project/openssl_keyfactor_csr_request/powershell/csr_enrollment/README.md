Introduction:

These are a set of PowerShell scripts specific to certificate enrollment using Certificate Signing Requests (CSRs).

The following are provided overviews of these scripts.

- Confirm-KeyfactorCSR.ps1: Used to validate the values generated from the CSR procedure.

- New-KeyFactorEnrollCSR.ps1: Submits a certificate signing request (CSR) to KeyFactor from a predefined newcert.req filename. The newcert.req file needs to be properly generated on the system.

- Get-KeyFactorCertificateStatus.ps1: Determines if the CSR request has been approved and is ready to be downloaded.

- Get-KeyfactorCertificate.ps1: After the CSR is process, this script will download the approved, signed certificate from KeyFactor to a newcert.cer file.
