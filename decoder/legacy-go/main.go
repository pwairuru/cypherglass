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
		// Infinite backoff: long CH/S3 outages must not kill decoder
		// (Fatal + unless-stopped = crash loop). Log lag via attempt count.
		log.Printf("ClickHouse not ready (attempt %d): %v", attempt, err)
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
	// Fail-closed state hygiene: a tampered LastFile must never steer resume.
	// Strict Bitcoin Core name (blkNNNNN.dat); anything else restarts cleanly.
	if state.LastFile != "" {
		ok := len(state.LastFile) >= 8 &&
			len(state.LastFile) <= 32 &&
			state.LastFile[:3] == "blk" &&
			state.LastFile[len(state.LastFile)-4:] == ".dat"
		digits := true
		for _, c := range state.LastFile[3 : len(state.LastFile)-4] {
			if c < '0' || c > '9' {
				digits = false
				break
			}
		}
		if !ok || !digits {
			log.Printf("WARNING: ignoring suspicious LastFile %q, resuming clean", state.LastFile)
			return &syncer.SyncState{}
		}
	}
	if state.LastOffset < 0 {
		log.Printf("WARNING: ignoring negative LastOffset %d, resuming clean", state.LastOffset)
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
