# Kubernetes Performance Validation Platform

A distributed service stack that drives controlled CPU, memory, cache, and
database load through a chained request path and records end-to-end and
per-service metrics to a file. Implements the design in [REQUIREMENTS.md](REQUIREMENTS.md).

## Architecture

```
Client → entry-service → cache-service → cpu-service → memory-service → database-service
                              (Redis)                                       (PostgreSQL)
```

Each service appends a metric to a shared envelope and forwards it downstream.
The database-service is the end of the chain and returns the accumulated
envelope back upstream. The entry-service generates multi-threaded load,
aggregates results, and writes a JSON report.

## Layout

```
cluster-performance-test/
├── services/
│   ├── entry-service/       # Multi-threaded test initiator + REST API
│   ├── cache-service/       # Redis lookup/store (dependency-free RESP client)
│   ├── cpu-service/         # CPU-heavy prime computation
│   ├── memory-service/      # Large allocations + GC pressure
│   └── database-service/    # Mongo inserts (MongoDB)
├── k8s/                     # Namespace, Redis, Postgres, services, HPAs
├── build-images.sh          # Build / push / kind-load all images
└── sample-request.json      # Example /start-test body
```

All custom services are written in Go and listen on port `8080` with a
`/healthz` endpoint; downstream services expose `/process`.

## 1. Build images

Local (kind / minikube with `imagePullPolicy: Always`):

```bash
./build-images.sh                 # builds perf-<svc>:latest
./build-images.sh --load          # also `kind load` into a kind cluster
```

Push to a registry:

```bash
./build-images.sh --registry myregistry.example.com/perf --tag v1 --push
```

When using a registry, point the manifests at it:

```bash
cd k8s
kustomize edit set image \
  perf-entry-service=myregistry.example.com/perf/perf-entry-service:v1 \
  perf-cache-service=myregistry.example.com/perf/perf-cache-service:v1 \
  perf-cpu-service=myregistry.example.com/perf/perf-cpu-service:v1 \
  perf-memory-service=myregistry.example.com/perf/perf-memory-service:v1 \
  perf-database-service=myregistry.example.com/perf/perf-database-service:v1
```

## 2. Deploy to the `ngpos-platform` namespace

With kustomize:

```bash
kubectl apply -k k8s/
```

Or with plain manifests (HPAs optional, need metrics-server):

```bash
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/10-redis.yaml
kubectl apply -f k8s/20-postgres.yaml
kubectl apply -f k8s/30-database-service.yaml
kubectl apply -f k8s/40-memory-service.yaml
kubectl apply -f k8s/50-cpu-service.yaml
kubectl apply -f k8s/60-cache-service.yaml
kubectl apply -f k8s/70-entry-service.yaml
kubectl apply -f k8s/80-hpa.yaml      # optional

kubectl -n ngpos-platform rollout status deploy/entry-service
```

## 3. Run a test

Port-forward the entry service (or use its LoadBalancer external IP):

```bash
kubectl -n ngpos-platform port-forward svc/entry-service 8080:80
```

Trigger a test:

```bash
curl -s -X POST http://localhost:8080/start-test \
  -H 'Content-Type: application/json' \
  -d @sample-request.json | jq
```

Request body fields:

| Field             | Description                                  |
| ----------------- | -------------------------------------------- |
| `durationSeconds` | Test duration (1–3600)                        |
| `threads`         | Concurrent worker count (1–2000)              |
| `requestRate`     | Target requests/sec; `0` = unthrottled        |
| `outputFile`      | Output path (default `/data/perf-results.json`) |

The synchronous response returns the `testId`, output path, and aggregated
summary (throughput, latency min/max/avg, p50/p95/p99).

## 4. Retrieve the results file

```bash
POD=$(kubectl -n ngpos-platform get pod -l app=entry-service -o jsonpath='{.items[0].metadata.name}')
kubectl -n ngpos-platform cp "$POD:/data/perf-results.json" ./perf-results.json
jq '.summary' perf-results.json
```

The file contains the aggregated `summary` plus per-request `results`, each
carrying the full per-service metric chain (`cache`, `cpu-service`,
`memory-service`, `database`).

## Tuning (environment variables)

| Service          | Variable               | Default | Purpose                         |
| ---------------- | ---------------------- | ------- | ------------------------------- |
| cache-service    | `CACHE_KEYSPACE`       | 1000    | Key range → cache hit/miss ratio |
| cpu-service      | `CPU_ITERATIONS`       | 200000  | Prime-search upper bound        |
| memory-service   | `MEMORY_ALLOC_MB`      | 100     | MB allocated per request        |
| memory-service   | `MEMORY_RETAIN_MS`     | 100     | Hold time before release        |
| database-service | `DB_MAX_CONNS`         | 50      | Postgres connection pool size   |

Each service URL (`CACHE_SERVICE_URL`, `CPU_SERVICE_URL`, `MEMORY_SERVICE_URL`,
`DATABASE_SERVICE_URL`) is also configurable via env / the manifests.

## Notes

- Redis and Postgres use `emptyDir` storage to keep the stack ephemeral. Swap
  for a `PersistentVolumeClaim` if you need durability.
- The Postgres password is a demo value in `k8s/20-postgres.yaml`. Replace it
  (e.g. with a sealed/External Secret) before any shared use.
- Resource requests/limits follow the requirements (`200m`/`256Mi` requests,
  `2`/`2Gi` limits) and can be tuned per service.
