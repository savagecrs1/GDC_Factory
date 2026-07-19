package main

import (
	"bytes"
	"encoding/json"
	"log"
	"math/rand"
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

func main() {
	pool := newRedisPool(env("REDIS_ADDR", "redis:6379"), 64)
	nextURL := env("CPU_SERVICE_URL", "http://cpu-service:8080")
	keyspace := atoiDefault(env("CACHE_KEYSPACE", "1000"), 1000)

	mux := http.NewServeMux()
	mux.HandleFunc("/process", func(w http.ResponseWriter, r *http.Request) {
		var e Envelope
		if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
			http.Error(w, "invalid envelope: "+err.Error(), http.StatusBadRequest)
			return
		}

		start := time.Now()
		key := "perf:key:" + strconv.Itoa(rand.Intn(keyspace))
		hit := false
		val, err := pool.do("GET", key)
		if err == nil && val != nil {
			hit = true
		} else if err == nil {
			// Cache miss: populate the key with a short TTL.
			_, _ = pool.do("SET", key, "1", "EX", "60")
		}
		end := time.Now()

		custom := map[string]interface{}{"hit": hit}
		if err != nil {
			custom["error"] = err.Error()
		}
		e.Metrics = append(e.Metrics, Metric{
			Service:    "cache",
			StartTime:  start.UnixMilli(),
			EndTime:    end.UnixMilli(),
			DurationMs: end.Sub(start).Milliseconds(),
			Custom:     custom,
		})

		if nextURL != "" {
			out, ferr := forward(nextURL, e)
			if ferr != nil {
				e.Metrics = append(e.Metrics, Metric{
					Service: "cache-forward-error",
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
	log.Printf("cache-service listening on %s (redis=%s next=%s)", addr, env("REDIS_ADDR", "redis:6379"), nextURL)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func writeJSON(w http.ResponseWriter, e Envelope) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(e)
}
