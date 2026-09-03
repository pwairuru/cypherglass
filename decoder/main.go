package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/freegoup/decoder/internal/clickhouse"
	"github.com/freegoup/decoder/internal/syncer"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	clickhouseHost := getEnv("CLICKHOUSE_HOST", "clickhouse")
	clickhousePort := getEnv("CLICKHOUSE_PORT", "9000")
	clickhouseUser := getEnv("CLICKHOUSE_USER", "bitcoin")
	clickhousePassword := getEnv("CLICKHOUSE_PASSWORD", "bitcoin_clickhouse")
	clickhouseDB := getEnv("CLICKHOUSE_DATABASE", "bitcoin")
	blocksDir := getEnv("BLOCKS_DIR", "/data/bitcoin/blocks")
	stateFile := getEnv("STATE_FILE", "/data/decoder_state.json")

	log.Printf("Connecting to ClickHouse %s:%s", clickhouseHost, clickhousePort)

	var chClient *clickhouse.Client
	var err error
	for attempt := 1; ; attempt++ {
		chClient, err = clickhouse.NewClient(ctx, clickhouseHost, clickhousePort, clickhouseUser, clickhousePassword, clickhouseDB)
		if err == nil {
			break
		}
		if attempt >= 30 {
			log.Fatalf("Failed to connect to ClickHouse after 30 attempts: %v", err)
		}
		log.Printf("ClickHouse not ready (attempt %d/30): %v", attempt, err)
		select {
		case <-ctx.Done():
			log.Fatalf("Aborted waiting for ClickHouse: %v", ctx.Err())
		case <-time.After(5 * time.Second):
		}
	}
	defer chClient.Close()

	state := loadState(stateFile)

	log.Printf("Starting sync from block %d", state.LastHeight+1)

	s := syncer.New(chClient, blocksDir, stateFile, state)

	go func() {
		s.Run(ctx)
	}()

	<-ctx.Done()
	log.Println("Shutting down...")
	s.Stop()
	time.Sleep(2 * time.Second)
}

func loadState(path string) *syncer.SyncState {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &syncer.SyncState{}
		}
		log.Printf("ERROR reading state: %v", err)
		return &syncer.SyncState{}
	}
	var state syncer.SyncState
	if err := json.Unmarshal(data, &state); err != nil {
		log.Printf("ERROR parsing state: %v", err)
		return &syncer.SyncState{}
	}
	return &state
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
