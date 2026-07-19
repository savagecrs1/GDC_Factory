This section provides two methods for generating a CSR for KeyFactor:

1. **certreq** (Windows native) - Private key stored in Windows certificate store
2. **OpenSSL** - Private key output as file (portable for GCP, Linux, etc.)

---

<h3>Method A: OpenSSL (recommended for multi-environment use)</h3>
<i>Prerequisite:</i> OpenSSL in PATH (e.g. Git for Windows)<br />
1. Edit openssl.cnf with your CN, OU, E, SAN values.<br />
2. Run <b>New-KeyfactorCSR-OpenSSL.bat</b> or <b>New-KeyfactorCSR-OpenSSL.ps1</b><br />
3. Output: <b>newreq.key</b> (private key - keep secure), <b>newreq.csr</b> (submit to KeyFactor)<br />

---

<h3>Method B: certreq (Windows)</h3>
<h3>REQUIREMENTS</h3>
- A Windows System with the certreq.exe command.<br />
- Local Administrator access.
<h3>CSR GENERATION PROCEDURE</h3>
1. Copy the certreq.inf and New-KeyfactorCSR.bat files to a working directory.<br />

2. Edit/Save the certreq.inf with the following values specific to your environment.<br />
<i>CN</i> - The Fully Qualified Domain Name (FQDN) used to access the resource.<br />
<i>OU</i> - Infra/ServiceNow Group Name.<br />
<i>E</i> - Distribution email that provides support to the application's certificate<br />
<i>SAN DNS</i> - At least the CN value must be include. Also include any other hostnames that will host the certificate.<br />
<i>FriendlyName (Optional)</i> - Provide a unique name for the certificate. (i.e. 2022-appname.kroger.com) <br />

3. Execute the "New-KeyfactorCSR.bat" script to output a newreq.csr file.<br />

<h4>Next Steps</h4>
- With the newreq.csr file you can proceed to the <a href="https://github.com/krogertechnology/cis-keyfactor-client-examples/tree/main/powershell/csr_enrollment">./csr_enrollment</a> powershell examples to request a signed certificate. Modify the script to work with environment that it is hosted on.<br />
- After you have downloaded the signed certificate certificate. Execute the following command to import into the keystore: <br />
<b>certreq.exe -accept newcert.cer</b>
