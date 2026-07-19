# OpenSSL / KeyFactor CSR Request Toolkit

Client-side examples for generating Certificate Signing Requests (CSRs) and enrolling them with the **Kroger KeyFactor** API.

Based on [cis-keyfactor-client-examples](https://github.com/krogertechnology/cis-keyfactor-client-examples), extended with **OpenSSL-based CSR generation** so the private key is emitted as a file (portable for GCP, Linux, and hybrid deployments).

**KeyFactor API:** https://keyfactor.kroger.com/KeyfactorAPI  
**Swagger:** https://keyfactor.kroger.com/KeyfactorAPI/swagger/index.html

**Author:** Raja Mohamed Elahi Batcha 

---

## Repository layout

| Path | Purpose |
|------|---------|
| `powershell/csr_generation/` | Generate CSR on Windows (`certreq` or **OpenSSL**) |
| `powershell/csr_enrollment/` | Submit CSR, check status, download signed cert |
| `powershell/import-certificate.ps1` | Import an existing cert into KeyFactor |
| `bash/csr_generation/` | Generate CSR with OpenSSL or keytool (Linux/macOS) |
| `bash/csr_enrollment/` | Enroll, parse, and download certs via `curl` |
| `postman/` | Postman collection for direct API testing |

---

## End-to-end workflow

```text
1. Edit config (CN, OU, email, SAN DNS)
2. Generate CSR + private key  →  newreq.csr, newreq.key
3. Validate CSR (optional)
4. Submit CSR to KeyFactor       →  KeyfactorRequestId
5. Wait for approval
6. Download signed certificate   →  newcert.cer / newcert.pem
7. Install cert + key on target host (or import to Windows store)
```

---

## Quick start (Windows + OpenSSL — recommended)

Prerequisites: **OpenSSL** on PATH (e.g. Git for Windows), Kroger VPN/network for KeyFactor API.

### 1. Generate CSR

```powershell
cd powershell\csr_generation
# Edit openssl.cnf: CN, OU, E, subjectAltName (DNS SANs)
.\New-KeyfactorCSR-OpenSSL.bat
# or
.\New-KeyfactorCSR-OpenSSL.ps1
```

**Output:**

| File | Description |
|------|-------------|
| `newreq.key` | Private key — **keep secure, never commit to git** |
| `newreq.csr` | Submit this to KeyFactor |

### 2. Enroll CSR with KeyFactor

```powershell
cd ..\csr_enrollment
# Edit New-KeyfactorEnrollCSR.ps1: GroupName, Environment, CA, Template
.\New-KeyfactorEnrollCSR.ps1 -UseWindowsAuth
# If 401 with Basic auth, try -UseWindowsAuth (domain-joined + VPN)
# If 403 with Windows auth, run without -UseWindowsAuth (KROGER\EUID prompt)
```

Note the returned **KeyfactorRequestId**.

### 3. Check status and download

```powershell
.\Get-KeyfactorCertificateStatus.ps1   # wait until approved
.\Get-KeyfactorCertificate.ps1       # downloads newcert.cer
.\Confirm-KeyfactorCSR.ps1           # optional: validate CSR fields
```

### 4. Windows cert store (certreq method only)

If you used **certreq** (key in Windows store, not OpenSSL file):

```powershell
certreq.exe -accept newcert.cer
```

For **OpenSSL** keys, install `newcert.pem` + `newreq.key` on your target platform (GCP load balancer, ingress, app server, etc.).

---

## Quick start (Linux / macOS / bash)

### Generate CSR

```bash
cd bash/csr_generation/openssl
# Edit openssl.cnf
./create-csr.sh
```

### Enroll and download

```bash
cd ../../csr_enrollment
./parse-keyfactor-csr.sh      # optional: inspect CSR
./enroll-keyfactor-csr.sh     # submit newreq.csr
./download-keyfactor-cert.sh  # after approval
```

**macOS note:** If enrollment fails with `date: illegal option -- -`, install GNU coreutils (`brew install coreutils`) and use `gdate` in the script, or see `bash/csr_enrollment/readme.md`.

---

## CSR generation methods

| Method | Platform | Private key location | Best for |
|--------|----------|----------------------|----------|
| **OpenSSL** (`New-KeyfactorCSR-OpenSSL.ps1` / `create-csr.sh`) | Windows, Linux | `newreq.key` file | GCP, K8s, Linux, multi-host |
| **certreq** (`New-KeyfactorCSR.bat`) | Windows only | Windows certificate store | IIS, Windows-native apps |
| **keytool** (`bash/csr_generation/keytool/`) | Java keystores | `.jks` / `.p12` | JVM applications |

Before generating, set these in `openssl.cnf` or `certreq.inf`:

- **CN** — FQDN for the resource
- **OU** — Infra / ServiceNow group (e.g. `INF-InStoreCloud`)
- **E** — Support distribution email
- **SAN DNS** — At minimum the CN; add all hostnames that will use the cert

---

## Authentication

| Method | When to use |
|--------|-------------|
| **Windows integrated** (`-UseWindowsAuth`) | Domain-joined PC on Kroger network/VPN |
| **Basic** (`KROGER\EUID` + password) | When integrated auth returns 403 |
| **curl + Kerberos** (bash) | UNIX systems with Kroger SSO |

---

## Security

- **Do not commit** `newreq.key`, `newreq.csr` with production data, or `newcert.cer` to git.
- Rotate or destroy private keys if exposed.
- Restrict file permissions on `newreq.key` (`chmod 600` on Linux).

---

## Postman

Import `postman/cis-keyFactor-client-examples.postman_collection.json` to exercise KeyFactor enrollment APIs interactively.

---

## Related docs

- `powershell/csr_generation/readme.md` — Windows CSR details
- `powershell/csr_enrollment/README.md` — Enrollment script reference
- `bash/readme.md` — Bash overview
- `bash/csr_enrollment/readme.md` — macOS date workaround

---

## Troubleshooting

| Issue | Action |
|-------|--------|
| OpenSSL not found | Install Git for Windows or Win32 OpenSSL; add to PATH |
| 401 on enroll | Try `-UseWindowsAuth` or verify KROGER credentials |
| 403 on enroll | Switch auth method (Windows ↔ Basic) |
| CSR missing SAN | Use `enroll-keyfactor-csr-san.sh` (bash) or add SANs in enrollment body |
| Wrong CA / template | Update `$CertificateAuthority` and `$CertificateTemplate` in enroll script |
