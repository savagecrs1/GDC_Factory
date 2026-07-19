# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM golang:1.23-alpine AS build
ARG TARGETOS
ARG TARGETARCH
# Corporate TLS interception can break module downloads with
# "x509: certificate signed by unknown authority". Fetch modules directly and
# ignore unknown certificate authorities / checksum DB for the build.
ENV GOPROXY=direct \
    GOSUMDB=off \
    GOINSECURE=* \
    GIT_SSL_NO_VERIFY=true
RUN apk add --no-cache git
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -ldflags="-s -w" -o /app .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 65532 app
COPY --from=build /app /app
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/app"]
