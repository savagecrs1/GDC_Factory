package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

const (
	maxThreads  = 2000
	maxDuration = 3600
)

// Metric is a single per-service measurement appended to the envelope.
type Metric struct {
	Service    string                 `json:"service"`
	StartTime  int64                  `json:"startTime"`
	EndTime    int64                  `json:"endTime"`
	DurationMs int64                  `json:"durationMs"`
	Custom     map[string]interface{} `json:"custom,omitempty"`
}

// Envelope is passed through the service chain, accumulating metrics.
type Envelope struct {
	RequestID string   `json:"requestId"`
	StartTime int64    `json:"startTime"`
	Metrics   []Metric `json:"metrics"`
}

// StartTestRequest is the POST /start-test body.
type StartTestRequest struct {
	DurationSeconds int    `json:"durationSeconds"`
	Threads         int    `json:"threads"`
	RequestRate     int    `json:"requestRate"`
	OutputFile      string `json:"outputFile"`
}

// RequestResult captures the outcome of a single end-to-end request.
type RequestResult struct {
	RequestID       string   `json:"requestId"`
	TotalDurationMs int64    `json:"totalDurationMs"`
	Metrics         []Metric `json:"metrics"`
	Success         bool     `json:"success"`
	Error           string   `json:"error,omitempty"`
}

// Summary holds aggregated test statistics.
type Summary struct {
	TotalRequests   int64   `json:"totalRequests"`
	SuccessRequests int64   `json:"successRequests"`
	FailedRequests  int64   `json:"failedRequests"`
	ThroughputRps   float64 `json:"throughputRps"`
	MinLatencyMs    int64   `json:"minLatencyMs"`
	MaxLatencyMs    int64   `json:"maxLatencyMs"`
	AvgLatencyMs    float64 `json:"avgLatencyMs"`
	P50LatencyMs    int64   `json:"p50LatencyMs"`
	P95LatencyMs    int64   `json:"p95LatencyMs"`
	P99LatencyMs    int64   `json:"p99LatencyMs"`
}

// TestOutput is the full JSON document written to the output file.
type TestOutput struct {
	TestID          string          `json:"testId"`
	DurationSeconds int             `json:"durationSeconds"`
	Threads         int             `json:"threads"`
	RequestRate     int             `json:"requestRate"`
	StartedAt       string          `json:"startedAt"`
	CompletedAt     string          `json:"completedAt"`
	Summary         Summary         `json:"summary"`
	Results         []RequestResult `json:"results"`
	ResultsFile     string          `json:"-"`
}

type runStats struct {
	durations []int64
	sum       int64
	success   int64
	failed    int64
}

func (s *runStats) add(r RequestResult) {
	if r.Success {
		s.success++
		s.durations = append(s.durations, r.TotalDurationMs)
		s.sum += r.TotalDurationMs
		return
	}
	s.failed++
}

func (s *runStats) summary(elapsed float64) Summary {
	sort.Slice(s.durations, func(i, j int) bool { return s.durations[i] < s.durations[j] })

	var min, max int64
	var avg float64
	if len(s.durations) > 0 {
		min = s.durations[0]
		max = s.durations[len(s.durations)-1]
		avg = float64(s.sum) / float64(len(s.durations))
	}
	total := s.success + s.failed
	var tput float64
	if elapsed > 0 {
		tput = float64(total) / elapsed
	}

	return Summary{
		TotalRequests:   total,
		SuccessRequests: s.success,
		FailedRequests:  s.failed,
		ThroughputRps:   round2(tput),
		MinLatencyMs:    min,
		MaxLatencyMs:    max,
		AvgLatencyMs:    round2(avg),
		P50LatencyMs:    percentile(s.durations, 50),
		P95LatencyMs:    percentile(s.durations, 95),
		P99LatencyMs:    percentile(s.durations, 99),
	}
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

func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func sendRequest(ctx context.Context, cacheURL string) RequestResult {
	envlp := Envelope{RequestID: newUUID(), StartTime: time.Now().UnixMilli(), Metrics: []Metric{}}
	body, _ := json.Marshal(envlp)

	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cacheURL+"/process", bytes.NewReader(body))
	if err != nil {
		return RequestResult{RequestID: envlp.RequestID, Success: false, Error: err.Error()}
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return RequestResult{RequestID: envlp.RequestID, Success: false, Error: err.Error()}
	}
	defer resp.Body.Close()

	var out Envelope
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return RequestResult{RequestID: envlp.RequestID, Success: false, Error: err.Error()}
	}
	dur := time.Since(start).Milliseconds()
	return RequestResult{
		RequestID:       out.RequestID,
		TotalDurationMs: dur,
		Metrics:         out.Metrics,
		Success:         resp.StatusCode == http.StatusOK,
	}
}

func runTest(cfg StartTestRequest, resultsFile string) (TestOutput, error) {
	cacheURL := env("CACHE_SERVICE_URL", "http://cache-service:8080")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if dir := filepath.Dir(resultsFile); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return TestOutput{}, err
		}
	}

	endTime := time.Now().Add(time.Duration(cfg.DurationSeconds) * time.Second)

	// Optional request-rate throttling via a token bucket.
	var tokens chan struct{}
	if cfg.RequestRate > 0 {
		tokens = make(chan struct{}, cfg.RequestRate)
		go func() {
			interval := time.Second / time.Duration(cfg.RequestRate)
			if interval <= 0 {
				interval = time.Microsecond
			}
			ticker := time.NewTicker(interval)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					select {
					case tokens <- struct{}{}:
					default:
					}
				}
			}
		}()
	}

	resultsCh := make(chan RequestResult, 1024)
	var (
		writerWG sync.WaitGroup
		wg       sync.WaitGroup
		stats    runStats
		writeErr error
	)

	writerWG.Add(1)
	go func() {
		defer writerWG.Done()

		f, err := os.Create(resultsFile)
		if err != nil {
			writeErr = err
			for res := range resultsCh {
				stats.add(res)
			}
			return
		}
		defer f.Close()

		w := bufio.NewWriter(f)
		enc := json.NewEncoder(w)
		for res := range resultsCh {
			stats.add(res)
			if writeErr != nil {
				continue
			}
			if err := enc.Encode(res); err != nil {
				writeErr = err
			}
		}
		if err := w.Flush(); writeErr == nil && err != nil {
			writeErr = err
		}
	}()

	startedAt := time.Now()
	for i := 0; i < cfg.Threads; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for time.Now().Before(endTime) {
				if tokens != nil {
					select {
					case <-tokens:
					case <-ctx.Done():
						return
					}
				}
				res := sendRequest(ctx, cacheURL)
				resultsCh <- res
			}
		}()
	}
	wg.Wait()
	close(resultsCh)
	writerWG.Wait()
	completedAt := time.Now()
	if writeErr != nil {
		return TestOutput{}, writeErr
	}

	summary := stats.summary(completedAt.Sub(startedAt).Seconds())
	return TestOutput{
		TestID:          newUUID(),
		DurationSeconds: cfg.DurationSeconds,
		Threads:         cfg.Threads,
		RequestRate:     cfg.RequestRate,
		StartedAt:       startedAt.UTC().Format(time.RFC3339),
		CompletedAt:     completedAt.UTC().Format(time.RFC3339),
		Summary:         summary,
		ResultsFile:     resultsFile,
	}, nil
}

func percentile(sorted []int64, p float64) int64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(math.Ceil(p/100*float64(len(sorted)))) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return sorted[idx]
}

func round2(f float64) float64 {
	return math.Round(f*100) / 100
}

func computeSummary(results []RequestResult, success, failed int64, elapsed float64) Summary {
	durations := make([]int64, 0, len(results))
	var sum int64
	for _, r := range results {
		if r.Success {
			durations = append(durations, r.TotalDurationMs)
			sum += r.TotalDurationMs
		}
	}
	sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })

	var min, max int64
	var avg float64
	if len(durations) > 0 {
		min = durations[0]
		max = durations[len(durations)-1]
		avg = float64(sum) / float64(len(durations))
	}
	total := success + failed
	var tput float64
	if elapsed > 0 {
		tput = float64(total) / elapsed
	}
	return Summary{
		TotalRequests:   total,
		SuccessRequests: success,
		FailedRequests:  failed,
		ThroughputRps:   round2(tput),
		MinLatencyMs:    min,
		MaxLatencyMs:    max,
		AvgLatencyMs:    round2(avg),
		P50LatencyMs:    percentile(durations, 50),
		P95LatencyMs:    percentile(durations, 95),
		P99LatencyMs:    percentile(durations, 99),
	}
}

func writeOutput(path string, out TestOutput) error {
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}

	if out.ResultsFile != "" {
		return writeOutputFromTemp(path, out)
	}

	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	// Buffered writer with a final flush on completion.
	w := bufio.NewWriter(f)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	if err := enc.Encode(out); err != nil {
		return err
	}
	return w.Flush()
}

func writeOutputFromTemp(path string, out TestOutput) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	rf, err := os.Open(out.ResultsFile)
	if err != nil {
		return err
	}
	defer rf.Close()

	w := bufio.NewWriter(f)
	writeField := func(name string, value interface{}, trailingComma bool) error {
		b, err := json.Marshal(value)
		if err != nil {
			return err
		}
		if trailingComma {
			_, err = fmt.Fprintf(w, "  %q: %s,\n", name, string(b))
		} else {
			_, err = fmt.Fprintf(w, "  %q: %s\n", name, string(b))
		}
		return err
	}

	if _, err := w.WriteString("{\n"); err != nil {
		return err
	}
	if err := writeField("testId", out.TestID, true); err != nil {
		return err
	}
	if err := writeField("durationSeconds", out.DurationSeconds, true); err != nil {
		return err
	}
	if err := writeField("threads", out.Threads, true); err != nil {
		return err
	}
	if err := writeField("requestRate", out.RequestRate, true); err != nil {
		return err
	}
	if err := writeField("startedAt", out.StartedAt, true); err != nil {
		return err
	}
	if err := writeField("completedAt", out.CompletedAt, true); err != nil {
		return err
	}
	if err := writeField("summary", out.Summary, true); err != nil {
		return err
	}
	if _, err := w.WriteString("  \"results\": [\n"); err != nil {
		return err
	}

	scanner := bufio.NewScanner(rf)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	first := true
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		if !first {
			if _, err := w.WriteString(",\n"); err != nil {
				return err
			}
		}
		if _, err := w.WriteString("    "); err != nil {
			return err
		}
		if _, err := w.Write(line); err != nil {
			return err
		}
		first = false
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	if !first {
		if _, err := w.WriteString("\n"); err != nil {
			return err
		}
	}
	if _, err := w.WriteString("  ]\n}\n"); err != nil {
		return err
	}

	return w.Flush()
}

func startTestHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req StartTestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.DurationSeconds <= 0 || req.DurationSeconds > maxDuration {
		http.Error(w, fmt.Sprintf("durationSeconds must be between 1 and %d", maxDuration), http.StatusBadRequest)
		return
	}
	if req.Threads <= 0 || req.Threads > maxThreads {
		http.Error(w, fmt.Sprintf("threads must be between 1 and %d", maxThreads), http.StatusBadRequest)
		return
	}
	if req.RequestRate < 0 {
		req.RequestRate = 0
	}
	if req.OutputFile == "" {
		req.OutputFile = env("DEFAULT_OUTPUT_FILE", "/data/perf-results.json")
	}

	log.Printf("starting test: duration=%ds threads=%d rate=%d output=%s",
		req.DurationSeconds, req.Threads, req.RequestRate, req.OutputFile)

	tmpResultsFile := req.OutputFile + ".results.tmp"
	defer func() {
		_ = os.Remove(tmpResultsFile)
	}()

	out, err := runTest(req, tmpResultsFile)
	if err != nil {
		log.Printf("test run failed: %v", err)
		http.Error(w, "test run failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if err := writeOutput(req.OutputFile, out); err != nil {
		log.Printf("failed to write output: %v", err)
		http.Error(w, "failed to write output: "+err.Error(), http.StatusInternalServerError)
		return
	}
	log.Printf("test complete: id=%s total=%d success=%d failed=%d p95=%dms",
		out.TestID, out.Summary.TotalRequests, out.Summary.SuccessRequests,
		out.Summary.FailedRequests, out.Summary.P95LatencyMs)

	resp := map[string]interface{}{
		"testId":     out.TestID,
		"outputFile": req.OutputFile,
		"summary":    out.Summary,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/start-test", startTestHandler)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })

	addr := ":" + env("PORT", "8080")
	srv := &http.Server{Addr: addr, Handler: mux}
	log.Printf("entry-service listening on %s", addr)
	log.Fatal(srv.ListenAndServe())
}
