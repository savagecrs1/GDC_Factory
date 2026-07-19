package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	_ "github.com/lib/pq"
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

func writeJSON(w http.ResponseWriter, e Envelope) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(e)
}

func openDB() (*sql.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		env("DB_HOST", "postgres"),
		env("DB_PORT", "5432"),
		env("DB_USER", "perf"),
		env("DB_PASSWORD", "perf"),
		env("DB_NAME", "perf"),
		env("DB_SSLMODE", "disable"),
	)
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(atoiDefault(env("DB_MAX_CONNS", "50"), 50))
	db.SetMaxIdleConns(atoiDefault(env("DB_MAX_IDLE_CONNS", "25"), 25))
	db.SetConnMaxLifetime(5 * time.Minute)
	return db, nil
}

func ensureSchema(db *sql.DB) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, err := db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS perf_events (
			id BIGSERIAL PRIMARY KEY,
			request_id TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`)
	return err
}

func main() {
	db, err := openDB()
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer db.Close()

	// Retry schema creation until Postgres is reachable.
	for i := 0; i < 30; i++ {
		if err := ensureSchema(db); err != nil {
			log.Printf("waiting for database (%d/30): %v", i+1, err)
			time.Sleep(2 * time.Second)
			continue
		}
		break
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/process", func(w http.ResponseWriter, r *http.Request) {
		var e Envelope
		if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
			http.Error(w, "invalid envelope: "+err.Error(), http.StatusBadRequest)
			return
		}

		start := time.Now()
		custom := map[string]interface{}{"operation": "insert"}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		res, dberr := db.ExecContext(ctx,
			"INSERT INTO perf_events(request_id) VALUES($1)", e.RequestID)
		cancel()

		var rows int64
		if dberr != nil {
			custom["error"] = dberr.Error()
		} else {
			rows, _ = res.RowsAffected()
		}
		custom["rows"] = rows
		end := time.Now()

		e.Metrics = append(e.Metrics, Metric{
			Service:    "database",
			StartTime:  start.UnixMilli(),
			EndTime:    end.UnixMilli(),
			DurationMs: end.Sub(start).Milliseconds(),
			Custom:     custom,
		})
		writeJSON(w, e)
	})
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		if err := db.Ping(); err != nil {
			http.Error(w, "db unavailable", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	addr := ":" + env("PORT", "8080")
	log.Printf("database-service listening on %s (host=%s db=%s)", addr, env("DB_HOST", "postgres"), env("DB_NAME", "perf"))
	log.Fatal(http.ListenAndServe(addr, mux))
}
