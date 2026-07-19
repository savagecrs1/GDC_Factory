This section will provide the steps needed for building the command to generate the openssl command that will perform the following.

1. Create a keystore (Default Format is PKCS12)
   <b>IMPORTANT NOTE: The keystore is NOT to be share or distributed.</b>
2. Create a CSR file to provide to a Certificate Authority for a signed certificate.

<h2>REQUIREMENTS</h2>

- keytool must be available on the system

<h2>PROCEDURE</h2>

1. Copy keytool-create-keystore.sh and keytool-create-csr.sh scripts to a working directory
2. Edit/Save the keytool-create-keystore.sh with the following values specific to your environment.
COMMON_NAME: The Fully Qualified Domain Name (FQDN) of the service hosting the certificate (i.e. appname.kroger.com)
ORGANZIATION_UNIT: Name of the Infra/ServiceNow/VMT Group that owns the certificate (i.e. INF-SUPPORTTEAMNAME)
EMAILADDRESS: Include the distribution email that supports the service
3. Edit/Save the keytool-create-csr.sh with the following values specific to your envrionment.
COMMON_NAME: The Fully Qualified Domain Name (FQDN) of the service hosting the certificate (i.e. appname.kroger.com)
3. Execute the keytool-create-csr.sh script to create the default output of newreq.key and newreq.csr.

<h3>Next Steps</h3>

With the newreq.csr file you can proceed to the ./csr_enrollment bash examples to request a signed certificate.
Modify the script to work with environment that it is hosted on.
