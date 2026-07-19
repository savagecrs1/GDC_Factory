Introduction

These are a set of bash scripts specific to certificate enrollment using Certificate Signing Requests (CSRs).

The following are provided overviews of these scripts.

- parse-keyfactor-csr.sh: Evaluates the entries of the CSR and outputs the data. Good to testing the composition of the CSR.

- enroll-keyfactor-csr.sh: Submits a certificate signing request (CSR) to KeyFactor from a predefined newcert.csr filename. The newcert.csr file needs to be properly generated on the system. NOTE: Alternatively, you can use <b>enroll-keyfactor-csr-san.sh</b> if you CSR did not generate the proper SAN DNS value(s).

- download-keyfactor-csr.sh: Downloads the certificate that has been signed and approved.


NOTE: There is an issue running the 'enroll-keyfactor-csr.sh' on Mac OS.

Symptom: running enroll-keyfactor-csr.sh fails on Mac. Specifically, error: "date: illegal option -- -", due to the TIMESTAMP expression: $(date --utc +%FT%T.%3NZ). Swapping --utc for -u does not solve the problem, as the milliseconds are not formatted correctly due to another inconsistency between Mac implementation of date and the *nix implementation.

Solution: install coreutils using Homebrew. brew install coreutils. Then, use gdate instead of date for the TIMESTAMP expression (as originally formatted in the script). This will use the coreutils Mac port of *nix utilities, which are compatible with the date format as specified.
