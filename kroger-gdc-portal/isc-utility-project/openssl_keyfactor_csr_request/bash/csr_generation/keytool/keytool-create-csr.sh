#bin/sh
#!/bin/bash
# TITLE: keytool-create-csr.sh
# DESCRIPTION: Creates a Certificate Signing Request (CSR) from 
# NOTE: This script is for demonstration purposes. For information can be found on
#   https://keyfactor.kroger.com/
# ------------------------------------------------------------------------------------
COMMON_NAME="hostname1.kroger.com" # Include the FQDN of the service certificate is hosting
KEYSTORE_TYPE="pkcs12" # Can be either pkcs12 or jks. pkcs12 recommended.

### BEGIN SCRIPT
if [[ $KEYSTORE_TYPE = jks ]]
then
 KEYSTORE_FILE_EXT="jks"
else
 KEYSTORE_FILE_EXT="p12"
fi

keytool -certreq \
-alias $COMMON_NAME \
-file newreq.csr \
-keystore $COMMON_NAME.$KEYSTORE_FILE_EXT \
-ext "san=dns:$COMMON_NAME" # This includes the required SAN DNS Value of the FQDN COMMON NAME
## NOTE: Depending on your infrastucutre, you may need to include multiple SAN DNS Values
##    The following extension exmaple can be used to include additional DNS Name values:
## "san=dns:hostname1.kroger.com,dns:hostname2.kroger.com,dns:hostname3.kroger.com"
