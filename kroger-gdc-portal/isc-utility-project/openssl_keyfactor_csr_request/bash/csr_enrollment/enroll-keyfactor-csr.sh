#!/bin/bash
# TITLE: enroll-keyfactor-csr.sh
# DESCRIPTION: Enrolls a Certificate Signing Request (CSR) using the KeyFactor system
#   referencing a newreq.csr.
# NOTE: This script is for demonstration purposes. For information can be found on
#   https://keyfactor.kroger.com/
# ------------------------------------------------------------------------------------

# CONFIGURATION VARIABLES
GROUP_NAME="GROUPNAME" ##Name of the Infra/ServiceNow/VMT Group that owns the certificate
ENVIRONMENT="Production" ##Type of environment the certificate is hosted on
KEYFACTOR_API="https://keyfactor.kroger.com/KeyfactorAPI" ##KeyFactor API Root URL
CA_LOCATION="N060CISPKI12.kroger.com\\\\Kroger CA P2" ##Certificate Authority Processing the Request
CERT_TEMPLATE="KrogerWebServer(2048bit)1yr(SS)" ##Certificate Template being requested
USERNAMEPASSSWORD_BASE64="KROGER\EUID:PASSWORD" ##BASE64 Encoded values that contains KROGER\EUID:PASSWORD

# BEGIN SCRIPT
CSR_FILE=$(cat newreq.csr)
TIMESTAMP=$(date --utc +%FT%T.%3NZ)

curl --location --request POST "$KEYFACTOR_API/Enrollment/CSR" \
--header 'X-Keyfactor-Requested-With: APIClient' \
--header "Authorization: Basic $USERNAMEPASSSWORD_BASE64" \
--header 'Content-Type: application/json' \
--data "{
  \"CSR\": \"$CSR_FILE\",
  \"CertificateAuthority\": \"$CA_LOCATION\",
  \"IncludeChain\": false,
  \"Timestamp\": \"$TIMESTAMP\",
  \"Template\": \"$CERT_TEMPLATE\",
  \"Metadata\": {
      \"Group\": \"$GROUP_NAME\",
      \"Environment\": \"$ENVIRONMENT\"
  }
}"
