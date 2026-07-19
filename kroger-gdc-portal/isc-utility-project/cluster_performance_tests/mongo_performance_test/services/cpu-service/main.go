package main

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"
)

type Metric struct {
	Service    string                 `json:"service"`
	StartTime  int64                  `json:"startTime"`
	EndTime    int64                  `json:"endTime"`
	DurationMs int64                  `json:"durationMs"`
	Custom     map[string]interface{} `json:"custom,omitempty"`
}

type Envelope struct {
	RequestID string   `json:"requestId"`
	StartTime int64    `json:"startTime"`
	Metrics   []Metric `json:"metrics"`
}

var httpClient = &http.Client{
	Timeout: 30 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        2000,
		MaxIdleConnsPerHost: 2000,
		IdleConnTimeout:     90 * time.Second,
	},
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func atoiDefault(s string, def int) int {
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return def
}

// burnCPU performs CPU-heavy work (prime counting via trial division) to
// simulate processor saturation. Returns the number of primes found.
func burnCPU(iterations int) int {
	count := 0
	for n := 2; n < iterations; n++ {
		prime := true
		for d := 2; d*d <= n; d++ {
			if n%d == 0 {
				prime = false
				break
			}
		}
		if prime {
			count++
		}
	}
	return count
}

func forward(nextURL string, e Envelope) (Envelope, error) {
	body, _ := json.Marshal(e)
	resp, err := httpClient.Post(nextURL+"/process", "application/json", bytes.NewReader(body))
	if err != nil {
		return e, err
	}
	defer resp.Body.Close()
	var out Envelope
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return e, err
	}
	return out, nil
}

func writeJSON(w http.ResponseWriter, e Envelope) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(e)
}

func main() {
	nextURL := env("MEMORY_SERVICE_URL", "http://memory-service:8080")
	iterations := atoiDefault(env("CPU_ITERATIONS", "200000"), 200000)

	mux := http.NewServeMux()
	mux.HandleFunc("/process", func(w http.ResponseWriter, r *http.Request) {
		var e Envelope
		if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
			http.Error(w, "invalid envelope: "+err.Error(), http.StatusBadRequest)
			return
		}

		start := time.Now()
		primes := burnCPU(iterations)
		end := time.Now()

		e.Metrics = append(e.Metrics, Metric{
			Service:    "cpu-service",
			StartTime:  start.UnixMilli(),
			EndTime:    end.UnixMilli(),
			DurationMs: end.Sub(start).Milliseconds(),
			Custom: map[string]interface{}{
				"iterations":  iterations,
				"primesFound": primes,
			},
		})

		if nextURL != "" {
			out, ferr := forward(nextURL, e)
			if ferr != nil {
				e.Metrics = append(e.Metrics, Metric{
					Service: "cpu-forward-error",
					Custom:  map[string]interface{}{"error": ferr.Error()},
				})
				writeJSON(w, e)
				return
			}
			e = out
		}
		writeJSON(w, e)
	})
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })

	addr := ":" + env("PORT", "8080")
	log.Printf("cpu-service listening on %s (iterations=%d next=%s)", addr, iterations, nextURL)
	log.Fatal(http.ListenAndServe(addr, mux))
}
