package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

//go:embed doc.json
var baseDocJSON []byte

var requestCounter int64

var errPerfEventsCollectionMissing = errors.New("perf_events collection is missing or inaccessible")

// orderItem represents a line item inserted into the document's items array.
type orderItem struct {
	OrderItemID string  `bson:"orderItemId" json:"orderItemId"`
	Quantity    int     `bson:"quantity"    json:"quantity"`
	Price       float64 `bson:"price"       json:"price"`
}

// itemCountForRequest returns the normal item count, but the variation count every 10th request.
func itemCountForRequest(baseCount, variationCount int) int {
	n := atomic.AddInt64(&requestCounter, 1)
	if n%10 == 0 {
		return variationCount
	}
	return baseCount
}

func buildOrderItems(requestID string, itemCount int) []interface{} {
	if itemCount < 0 {
		itemCount = 0
	}
	items := make([]interface{}, itemCount)
	for i := 0; i < itemCount; i++ {
		items[i] = orderItem{
			OrderItemID: fmt.Sprintf("%s-item-%04d", requestID, i),
			Quantity:    1,
			Price:       2.89,
		}
	}
	return items
}

// buildOrderDoc unmarshals the base doc template and ensures request metadata
// is set before persisting to Mongo.
func buildOrderDoc(requestID string) (map[string]interface{}, error) {
	var doc map[string]interface{}
	if err := json.Unmarshal(baseDocJSON, &doc); err != nil {
		return nil, fmt.Errorf("unmarshal base doc: %w", err)
	}

	doc["items"] = []interface{}{}
	doc["request_id"] = requestID
	doc["created_at"] = time.Now()
	doc["updated_at"] = time.Now()

	return doc, nil
}

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

func openDB() (*mongo.Client, error) {
	user := env("DB_USER", "perf")
	password := env("DB_PASSWORD", "perf")
	host := env("DB_HOST", "mongodb")
	port := env("DB_PORT", "27017")
	
	// Build MongoDB connection string
	uri := fmt.Sprintf("mongodb://%s:%s@%s:%s/admin",
		user, password, host, port)
	
	opts := options.Client().
		ApplyURI(uri).
		SetMaxPoolSize(uint64(atoiDefault(env("DB_MAX_CONNS", "50"), 50))).
		SetMinPoolSize(uint64(atoiDefault(env("DB_MAX_IDLE_CONNS", "25"), 25)))
	
	client, err := mongo.Connect(context.Background(), opts)
	if err != nil {
		return nil, err
	}
	
	err = client.Ping(context.Background(), nil)
	if err != nil {
		return nil, err
	}
	
	return client, nil
}

func ensureSchema(client *mongo.Client) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	db := client.Database("perf")
	collection := db.Collection("perf_events")
	
	// Create index on request_id for faster lookups
	indexModel := mongo.IndexModel{
		Keys: bson.D{{Key: "request_id", Value: 1}},
	}
	
	_, err := collection.Indexes().CreateOne(ctx, indexModel)
	return err
}

func isMissingCollectionError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "collection") && strings.Contains(errStr, "does not exist") ||
		strings.Contains(errStr, "no such collection") ||
		strings.Contains(errStr, "ns does not exist")
}

func insertOrderDocWithContext(ctx context.Context, collection *mongo.Collection, requestID string) (interface{}, error) {
	doc, err := buildOrderDoc(requestID)
	if err != nil {
		return nil, err
	}

	res, err := collection.InsertOne(ctx, doc)
	if err != nil {
		if isMissingCollectionError(err) {
			return nil, errPerfEventsCollectionMissing
		}
		return nil, err
	}
	return res.InsertedID, nil
}

func getOrderDocByID(ctx context.Context, collection *mongo.Collection, id interface{}) (map[string]interface{}, error) {
	var doc map[string]interface{}
	err := collection.FindOne(ctx, bson.M{"_id": id}).Decode(&doc)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func replaceOrderDocWithItemCount(ctx context.Context, collection *mongo.Collection, id interface{}, doc map[string]interface{}, requestID string, itemCount int) (int64, error) {
	doc["items"] = buildOrderItems(requestID, itemCount)
	doc["updated_at"] = time.Now()
	doc["item_count"] = itemCount

	res, err := collection.ReplaceOne(ctx, bson.M{"_id": id}, doc)
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}

func main() {
	client, err := openDB()
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer client.Disconnect(context.Background())

	// Retry schema creation until MongoDB is reachable.
	schemaReady := false
	for i := 0; i < 30; i++ {
		if err := ensureSchema(client); err != nil {
			log.Printf("waiting for database (%d/30): %v", i+1, err)
			time.Sleep(2 * time.Second)
			continue
		}
		schemaReady = true
		break
	}
	if !schemaReady {
		log.Fatal("failed to initialize database schema after startup retries")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/process", func(w http.ResponseWriter, r *http.Request) {
		var e Envelope
		if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
			http.Error(w, "invalid envelope: "+err.Error(), http.StatusBadRequest)
			return
		}

		baseCount := atoiDefault(env("DB_INSERT_ITEM_COUNT", "40"), 40)
		variationCount := atoiDefault(env("DB_INSERT_ITEM_COUNT_VARIATION", "100"), 100)
		itemCount := itemCountForRequest(baseCount, variationCount)

		start := time.Now()
		custom := map[string]interface{}{
			"operation":      "store-retrieve-update-store",
			"itemCount":      itemCount,
			"baseCount":      baseCount,
			"variationCount": variationCount,
			"insertDurationMs":  int64(0),
			"retrieveDurationMs": int64(0),
			"updateDurationMs":   int64(0),
			"failedStep":         "",
		}

		ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
		collection := client.Database("perf").Collection("perf_events")
		insertStart := time.Now()
		insertedID, dberr := insertOrderDocWithContext(ctx, collection, e.RequestID)
		custom["insertDurationMs"] = time.Since(insertStart).Milliseconds()
		insertAttempts := 1

		// Runtime recovery: if collection is missing, try to recreate schema and retry once
		if errors.Is(dberr, errPerfEventsCollectionMissing) {
			if schemaErr := ensureSchema(client); schemaErr != nil {
				dberr = fmt.Errorf("insert failed because collection is missing and schema repair failed: %w", schemaErr)
			} else {
				insertAttempts++
				retryStart := time.Now()
				insertedID, dberr = insertOrderDocWithContext(ctx, collection, e.RequestID)
				custom["insertDurationMs"] = custom["insertDurationMs"].(int64) + time.Since(retryStart).Milliseconds()
			}
		}
		custom["insertAttempts"] = insertAttempts

		fetched := false
		updatedRows := int64(0)
		if dberr == nil {
			retrieveStart := time.Now()
			storedDoc, getErr := getOrderDocByID(ctx, collection, insertedID)
			custom["retrieveDurationMs"] = time.Since(retrieveStart).Milliseconds()
			if getErr != nil {
				dberr = fmt.Errorf("retrieve after insert failed: %w", getErr)
				custom["failedStep"] = "retrieve"
			} else {
				fetched = true
				updateStart := time.Now()
				updatedRows, dberr = replaceOrderDocWithItemCount(ctx, collection, insertedID, storedDoc, e.RequestID, itemCount)
				custom["updateDurationMs"] = time.Since(updateStart).Milliseconds()
				if dberr != nil {
					dberr = fmt.Errorf("update after retrieve failed: %w", dberr)
					custom["failedStep"] = "update"
				}
			}
		} else {
			custom["failedStep"] = "insert"
		}
		cancel()

		if dberr != nil {
			custom["error"] = dberr.Error()
		}
		custom["inserted"] = insertedID != nil
		custom["retrieved"] = fetched
		custom["updatedRows"] = updatedRows
		custom["rows"] = int64(1) + updatedRows
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
		if err := client.Ping(context.Background(), nil); err != nil {
			http.Error(w, "db unavailable", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	addr := ":" + env("PORT", "8080")
	log.Printf("database-service listening on %s (host=%s db=perf)", addr, env("DB_HOST", "mongodb"))
	log.Fatal(http.ListenAndServe(addr, mux))
}
