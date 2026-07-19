package main

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"runtime"
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

// burnMemory allocates allocMB megabytes, touches every page so the memory is
// actually committed, retains it for retainMs, then releases it to provoke GC.
func burnMemory(allocMB, retainMs int) {
	block := make([][]byte, allocMB)
	for i := 0; i < allocMB; i++ {
		b := make([]byte, 1024*1024)
		for j := 0; j < len(b); j += 4096 {
			b[j] = byte(i + j)
		}
		block[i] = b
	}
	time.Sleep(time.Duration(retainMs) * time.Millisecond)
	runtime.KeepAlive(block)
	block = nil
	runtime.GC()
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
	nextURL := env("DATABASE_SERVICE_URL", "http://database-service:8080")
	allocMB := atoiDefault(env("MEMORY_ALLOC_MB", "100"), 100)
	retainMs := atoiDefault(env("MEMORY_RETAIN_MS", "100"), 100)

	mux := http.NewServeMux()
	mux.HandleFunc("/process", func(w http.ResponseWriter, r *http.Request) {
		var e Envelope
		if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
			http.Error(w, "invalid envelope: "+err.Error(), http.StatusBadRequest)
			return
		}

		start := time.Now()
		burnMemory(allocMB, retainMs)
		end := time.Now()

		e.Metrics = append(e.Metrics, Metric{
			Service:    "memory-service",
			StartTime:  start.UnixMilli(),
			EndTime:    end.UnixMilli(),
			DurationMs: end.Sub(start).Milliseconds(),
			Custom: map[string]interface{}{
				"allocatedMB": allocMB,
				"retainedMs":  retainMs,
			},
		})

		if nextURL != "" {
			out, ferr := forward(nextURL, e)
			if ferr != nil {
				e.Metrics = append(e.Metrics, Metric{
					Service: "memory-forward-error",
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
	log.Printf("memory-service listening on %s (allocMB=%d retainMs=%d next=%s)", addr, allocMB, retainMs, nextURL)
	log.Fatal(http.ListenAndServe(addr, mux))
}
