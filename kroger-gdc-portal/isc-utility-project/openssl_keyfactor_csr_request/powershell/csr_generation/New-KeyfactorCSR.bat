@ECHO OFF
:: TITLE: New-KeyfactorCSR.bat
:: DESCRIPTION: Generates a Certificate Signing Request (CSR) using the certreq
:: command.
::   NOTE: This script is for demonstration purposes. For information can be found on
::   https://keyfactor.kroger.com/
:: ----------------------------------------------------------------------------------
certreq.exe -new certreq.inf newreq.csr
