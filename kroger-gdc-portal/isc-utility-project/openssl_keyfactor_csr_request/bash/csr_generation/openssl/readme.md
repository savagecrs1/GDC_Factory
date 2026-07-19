This section will provide the steps needed for building the command to generate the openssl command that will perform the following.

1. Create a PRIVATE KEY FILE (.key)
   <b>IMPORTANT NOTE: The PRIVATE KEY FILE is NOT to be share or distributed.</b>
2. Create a CSR file to provide to a Certificate Authority for a signed certificate.

<h2>REQUIREMENTS</h2>

- openssl must be available on the system

<h2>PROCEDURE</h2>

1. Copy the openssl.cnf and create-csr.sh scripts to a working directory
2. Edit/Save the openssl.cnf with the following values specific to your environment.
  organizationalUnitName - The ServiceNow or Infra group that support the service or certificate.
  commonName = The Fully Qualified Domain Name (FQDN) of the host of the certificate.
  DNS.0 = Same as the commonName value.
3. Execute the create-csr.sh script to create the default output of newreq.key and newreq.csr.

<h3>Next Steps</h3>

With the newreq.csr file you can proceed to the [./csr_enrollment bash] (https://github.com/krogertechnology/cis-keyfactor-client-examples/tree/main/bash/csr_enrollment) examples to request a signed certificate.
Modify the script to work with environment that it is hosted on.
