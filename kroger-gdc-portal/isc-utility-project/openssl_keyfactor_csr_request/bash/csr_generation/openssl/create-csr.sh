#bin/sh
openssl req -config ./openssl.cnf -new -newkey rsa -nodes -keyout newreq.key -out newreq.csr
