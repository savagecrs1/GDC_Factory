#bin/sh
# TITLE: keytool-create-keystore.sh
# DESCRIPTION: Creates a keystore and defines the Distinguished Name needed to
#   generate the Certificate Signing Request.
# NOTE: This script is for demonstration purposes. Please work with the vendor that
#   support your system for specific procedures. More information can be found on
#   https://keyfactor.kroger.com/
# ------------------------------------------------------------------------------------
COMMON_NAME="hostname1.kroger.com" # Include the FQDN of the service certificate is hosting
ORGANIZATION_UNIT="KTD" # Name of the Infra/ServiceNow/VMT Group that owns the certificate
EMAILADDRESS="noreply@kroger.com" # (optional) Include the distribution email that supports the service
KEYSTORE_TYPE="pkcs12" # Can be either pkcs12 or jks. pkcs12 recommended.

### BEGIN SCRIPT ###
if [[ $KEYSTORE_TYPE = jks ]]
then
 KEYSTORE_FILE_EXT="jks"
else
 KEYSTORE_FILE_EXT="p12"
fi

keytool -genkey -deststoretype $KEYSTORE_TYPE \
-alias $COMMON_NAME \
-keyalg RSA \
-keysize 2048 \
-keystore $COMMON_NAME.$KEYSTORE_FILE_EXT \
-dname "CN=$COMMON_NAME, OU=$ORGANIZATION_UNIT, O=The Kroger Co, L=Cincinnati, ST=OH, C=US, EMAILADDRESS=$EMAILADDRESS"
