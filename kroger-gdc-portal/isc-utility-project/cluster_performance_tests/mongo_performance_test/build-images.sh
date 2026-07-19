#!/usr/bin/env bash
set -euo pipefail

# Builds (and optionally pushes) all performance-test service images.
#
# Usage:
#   ./build-images.sh [--registry <prefix>] [--tag <tag>] [--push] [--load]
#
# Examples:
#   ./build-images.sh                                  # krogertechnology-docker-prod.jfrog.io/ecs_docker_repo/perf-<svc>:latest
#   ./build-images.sh --tag v1 --push                  # build + push to the JFrog repo
#   ./build-images.sh --registry myreg.example.com/perf --tag v1 --push
#   ./build-images.sh --load                           # build + `kind load` into a kind cluster

REGISTRY="krogertechnology-docker-prod.jfrog.io/ecs_docker_repo/"
TAG="latest"
PUSH=false
KIND_LOAD=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICES=(entry-service cache-service cpu-service memory-service database-service)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --registry) REGISTRY="${2%/}/"; shift 2 ;;
    --tag)      TAG="$2"; shift 2 ;;
    --push)     PUSH=true; shift ;;
    --load)     KIND_LOAD=true; shift ;;
    -h|--help)  grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

for svc in "${SERVICES[@]}"; do
  image="${REGISTRY}perf-${svc}:${TAG}"
  echo "==> Building ${image}"
  docker build --platform linux/amd64 -t "${image}" "${SCRIPT_DIR}/services/${svc}"
  if [[ "${PUSH}" == "true" ]]; then
    echo "==> Pushing ${image}"
    docker push "${image}"
  fi
  if [[ "${KIND_LOAD}" == "true" ]]; then
    echo "==> Loading ${image} into kind"
    kind load docker-image "${image}"
  fi
done

echo "Done. Images built with prefix '${REGISTRY}perf-' and tag '${TAG}'."
