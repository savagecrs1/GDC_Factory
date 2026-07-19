#!/bin/bash
# TITLE: parse-keyfactor-csr.sh
# DESCRIPTION: Uses the Keyfactor API to parse a generated CSR (newreq.csr).
# NOTE: This script is for demonstration purposes. For information can be found on
#   https://keyfactor.kroger.com/
# ------------------------------------------------------------------------------------

# CONFIGURATION VARIABLES
KEYFACTOR_API="https://keyfactor.kroger.com/KeyfactorAPI" ##KeyFactor API Root URL
USERNAMEPASSSWORD_BASE64="KROGER\EUID:Password" ##BASE64 Encoded values that contains KROGER\EUID:PASSWORD

# BEGIN SCRIPT
CSR_FILE=$(cat newreq.csr)

curl --location --request POST "$KEYFACTOR_API/Enrollment/CSR/Parse" \
--header 'X-Keyfactor-Requested-With: APIClient' \
--header "Authorization: Basic $USERNAMEPASSSWORD_BASE64" \
--header 'Content-Type: application/json' \
--data "{
  \"CSR\": \"$CSR_FILE\"
}"
