# Kubernetes Performance Validation Platform – Requirements Document

## 1. Objective

Design and implement a distributed application stack deployed on Kubernetes to validate cluster performance under controlled load conditions.

The platform will:
- Simulate realistic microservice communication patterns
- Generate CPU-intensive and memory-intensive workloads
- Include caching and database layers
- Support multi-threaded load generation
- Capture end-to-end and per-service performance metrics
- Persist results to a file (no Prometheus or external monitoring required)

---

## 2. High-Level Architecture

```

Client
↓
Entry Service (Multi-threaded Test Initiator)
↓
Cache Layer (Redis)
↓
CPU Service
↓
Memory Service
↓
Database Service (PostgreSQL)
↓
Response (metrics propagated upstream)

```

---

## 3. Core Components

### 3.1 Entry Service (Test Initiator & Orchestrator)

Responsibilities:
- Expose REST API to trigger tests
- Generate multi-threaded load
- Coordinate service calls
- Track test duration
- Collect and aggregate metrics
- Write results to file

---

### 3.2 CPU-Intensive Service

Responsibilities:
- Perform CPU-heavy computations
- Simulate processor saturation
- Append execution metrics

Example workloads:
- Prime number calculations
- Hashing loops
- Matrix operations

---

### 3.3 Memory-Intensive Service

Responsibilities:
- Allocate large in-memory objects
- Simulate memory pressure
- Trigger garbage collection behavior
- Append memory metrics

---

### 3.4 Cache Layer

Technology:
- Redis (preferred)

Responsibilities:
- Provide cache lookup/store
- Simulate hit/miss scenarios
- Reduce downstream load

---

### 3.5 Database Layer

Technology:
- PostgreSQL (recommended)

Responsibilities:
- Perform read/write operations
- Simulate persistence load
- Provide query performance data

---

## 4. API Requirements

### Endpoint

```

POST /start-test

````

---

### Request Body

```json
{
  "durationSeconds": 300,
  "threads": 50,
  "requestRate": 200,
  "outputFile": "/tmp/perf-results.json"
}
````

***

### Behavior

* Validate request parameters
* Initialize test run
* Spawn worker threads
* Execute workload for specified duration
* Aggregate metrics
* Write results to file
* Return summary response

***

## 5. Multi-Threaded Execution Model

### Requirements

* Thread pool-based execution
* Fixed or configurable concurrency
* Continuous request generation until time limit
* Thread-safe result collection

***

### Worker Flow

1. Generate request payload
2. Send request through service chain
3. Record:
   * Start time
   * End time
   * Full metrics response
4. Store results in shared structure

***

### Execution Logic (Pseudo)

```pseudo
startTime = now()
endTime = startTime + duration

while now() < endTime:
    submit worker task

wait for all threads to complete
aggregate results
write to file
```

***

## 6. Metrics Design

### 6.1 Metrics Envelope

Each request carries a metrics object:

```json
{
  "requestId": "uuid",
  "startTime": 1710000000000,
  "metrics": []
}
```

***

### 6.2 Per-Service Metric Format

Each service appends:

```json
{
  "service": "service-name",
  "startTime": 1710000000100,
  "endTime": 1710000000200,
  "durationMs": 100,
  "custom": {}
}
```

***

### 6.3 Final Response Format

```json
{
  "requestId": "uuid",
  "totalDurationMs": 420,
  "metrics": [
    { "service": "cache" },
    { "service": "cpu-service" },
    { "service": "memory-service" },
    { "service": "database" }
  ]
}
```

***

## 7. Service-Specific Requirements

### 7.1 CPU Service

Behavior:

* Execute CPU-heavy loops or calculations

Metrics:

```json
{
  "service": "cpu-service",
  "durationMs": 150,
  "custom": {
    "iterations": 500000
  }
}
```

***

### 7.2 Memory Service

Behavior:

* Allocate memory (e.g., 100MB+)
* Retain for configurable duration
* Release memory

Metrics:

```json
{
  "service": "memory-service",
  "durationMs": 200,
  "custom": {
    "allocatedMB": 100,
    "retainedMs": 100
  }
}
```

***

### 7.3 Cache Layer

Behavior:

* Perform lookup
* Return hit or miss

Metrics:

```json
{
  "service": "cache",
  "durationMs": 10,
  "custom": {
    "hit": true
  }
}
```

***

### 7.4 Database Layer

Behavior:

* Execute inserts and/or queries

Metrics:

```json
{
  "service": "database",
  "durationMs": 75,
  "custom": {
    "operation": "insert",
    "rows": 1
  }
}
```

***

## 8. Metrics Aggregation Requirements

The initiator must compute:

* Total requests
* Successful vs failed requests
* Throughput (requests per second)
* Latency:
  * Minimum
  * Maximum
  * Average
  * Percentiles (p50, p95, p99)

***

## 9. File Output Requirements

### 9.1 JSON Output (Preferred)

```json
{
  "testId": "abc-123",
  "durationSeconds": 300,
  "summary": {
    "totalRequests": 10000,
    "avgLatencyMs": 120,
    "p95LatencyMs": 210
  },
  "results": [
    {
      "requestId": "uuid",
      "totalDurationMs": 420,
      "metrics": []
    }
  ]
}
```

***

### 9.2 CSV Output (Optional)

```
request_id,total_duration,cpu_time,memory_time,db_time
```

***

### 9.3 File Handling Behavior

* Buffered writes for efficiency
* Periodic flush (e.g., every 100 records)
* Final flush on completion

***

## 10. Kubernetes Requirements

### 10.1 Resource Configuration

```yaml
resources:
  requests:
    cpu: "200m"
    memory: "256Mi"
  limits:
    cpu: "2"
    memory: "2Gi"
```

***

### 10.2 Scaling

* Horizontal scaling supported
* Optional HPA based on CPU/memory

***

### 10.3 Networking

* Internal communication: ClusterIP
* Entry service exposed via:
  * LoadBalancer or Ingress

***

## 11. Non-Functional Requirements

### Scalability

* All services must support horizontal scaling

### Configurability

* Use environment variables or ConfigMaps

### Fault Tolerance

* Timeout handling
* Retry logic (optional)

### Performance Safety

* Maximum thread limits
* Request throttling
* Backpressure mechanisms

***

## 12. Technology Recommendations

| Layer          | Technology         |
| -------------- | ------------------ |
| Entry Service  | Go / Java / Python |
| CPU Service    | Go / Java          |
| Memory Service | Java / Node.js     |
| Cache          | Redis              |
| Database       | PostgreSQL         |
| Deployment     | Kubernetes         |

***

## 13. Test Execution Flow

1. Client calls `/start-test`
2. Entry service:
   * Starts thread pool
   * Generates concurrent load
3. Requests flow through:
   * Cache → CPU → Memory → DB
4. Each service appends metrics
5. Response returns upstream
6. Initiator:
   * Aggregates results
   * Writes output to file
7. Test completes after duration

***

## 14. Success Criteria

* Multi-threaded test execution is stable
* Metrics propagate across all services
* Output file contains:
  * Per-request metrics
  * Aggregated performance data
* System identifies:
  * CPU bottlenecks
  * Memory pressure
  * Cache effectiveness
  * Database latency

***

## 15. Future Enhancements

* HTML report generation from results
* Latency visualization charts
* Chaos testing (failures, latency injection)
* Replayable test scenarios
* Distributed tracing integration

```

---

If you want next, I can turn this into:
- ✅ A **ready-to-run GitHub repo structure**
- ✅ **Working code for each service**
- ✅ **Kubernetes manifests (Helm or plain YAML)**
- ✅ A **Go-based high-performance initiator**

Just say the word 👍
```
