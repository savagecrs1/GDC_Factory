#!/bin/bash
# TITLE: download-keyfactor-cert.sh
# DESCRIPTION: Download a certificate signed from the Kroger CA.
# NOTE: This script is for demonstration purposes. More information can be found on
#   https://keyfactor.kroger.com/
# ------------------------------------------------------------------------------------
CERTIFICATE_ID="6415" #The Unique ID of the certificate. Provided as "CertID" in EnrollCSR response.
COLLECTION_ID="0" #The collection ID given to Infra/ServiceNow/VMT Group that owns the certificate
CERTIFICATE_FORMAT="PEM" #Sets the type of file to download. Either PEM or DER
INCLUDE_CHAIN="FALSE" #Includes the entire certificate trust chain if TRUE
KEYFACTOR_API="https://keyfactor.kroger.com/KeyfactorAPI" #KeyFactor API Root URL
USERNAMEPASSSWORD_BASE64="KROGER\USERANME:PASSWORD" ##BASE64 Encoded values that contains KROGER\EUID:PASSWORD

RESPONSE=$(curl -s --location --request POST "$KEYFACTOR_API/Certificates/Download?collectionId=$CERTIFICATE_ID" \
--header "X-CertificateFormat: $CERTIFICATE_FORMAT" \
--header 'X-Keyfactor-Requested-With: APIClient' \
--header "Authorization: Basic $USERNAMEPASSSWORD_BASE64" \
--header 'Content-Type: application/json' \
--data "{
  \"CertID\": \"$CERTIFICATE_ID\",
  \"IncludeChain\": \"$INCLUDE_CHAIN\"
}" \
)
## PARSE OUTPUT AND BASE64 DECODE CONTENT RESPONSE
echo $RESPONSE | cut -d \" -f4 | base64 --decode
