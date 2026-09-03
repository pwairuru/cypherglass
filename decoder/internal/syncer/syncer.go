package syncer

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/freegoup/decoder/internal/clickhouse"
	"github.com/freegoup/decoder/internal/parser"
)

type SyncState struct {
	LastHeight uint32 `json:"last_height"`
	LastFile   string `json:"last_file"`
	LastOffset int64  `json:"last_offset"`
}

type Syncer struct {
	client    *clickhouse.Client
	blocksDir string
	state     *SyncState
	stateFile string
	mu        sync.Mutex
	stopCh    chan struct{}
	deobf     *parser.XORDeobfuscator
}

func New(client *clickhouse.Client, blocksDir, stateFile string, state *SyncState) *Syncer {
	return &Syncer{
		client:    client,
		blocksDir: blocksDir,
		state:     state,
		stateFile: stateFile,
		stopCh:    make(chan struct{}),
		deobf:     loadDeobfuscator(blocksDir),
	}
}

// loadDeobfuscator reads the xor.dat obfuscation key Bitcoin Core uses for
// blk*.dat files. Returns nil if no xor.dat exists (unobfuscated blocks).
func loadDeobfuscator(blocksDir string) *parser.XORDeobfuscator {
	data, err := os.ReadFile(filepath.Join(blocksDir, "xor.dat"))
	if err != nil || len(data) == 0 {
		return nil
	}
	key := make([]byte, 8)
	copy(key, data)
	log.Printf("Loaded blk file obfuscation key from xor.dat")
	return parser.NewXORDeobfuscator(key)
}

func (s *Syncer) Run(ctx context.Context) {
	if err := s.catchUpHistorical(ctx); err != nil {
		log.Printf("Historical sync error: %v", err)
	}

	os.MkdirAll(s.blocksDir, 0755)

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatalf("fsnotify: %v", err)
	}
	defer watcher.Close()

	if err := watcher.Add(s.blocksDir); err != nil {
		log.Fatalf("watch %s: %v", s.blocksDir, err)
	}

	log.Printf("Watching %s for new block files", s.blocksDir)

	// fsnotify does not reliably emit events on FUSE/JuiceFS mounts, so poll
	// as a fallback to pick up new or growing blk*.dat files.
	pollTicker := time.NewTicker(10 * time.Second)
	defer pollTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.stopCh:
			return
		case <-pollTicker.C:
			s.pollForBlocks(ctx)
		case event := <-watcher.Events:
			if event.Has(fsnotify.Create) || event.Has(fsnotify.Write) {
				if strings.HasPrefix(filepath.Base(event.Name), "blk") && strings.HasSuffix(event.Name, ".dat") {
					time.Sleep(2 * time.Second)
					s.processFile(ctx, event.Name)
				}
			}
		case err := <-watcher.Errors:
			log.Printf("Watcher error: %v", err)
		}
	}
}

func (s *Syncer) pollForBlocks(ctx context.Context) {
	files, err := s.listBlkFiles()
	if err != nil {
		return
	}
	for _, f := range files {
		if s.state.LastFile != "" && f < s.state.LastFile {
			continue
		}
		s.processFile(ctx, filepath.Join(s.blocksDir, f))
	}
}

func (s *Syncer) Stop() {
	select {
	case <-s.stopCh:
	default:
		close(s.stopCh)
	}
}

func (s *Syncer) catchUpHistorical(ctx context.Context) error {
	files, err := s.listBlkFiles()
	if err != nil {
		return err
	}

	if len(files) == 0 {
		log.Println("No blk*.dat files found, waiting for IBD...")
		return nil
	}

	for _, f := range files {
		if s.state.LastFile != "" && f < s.state.LastFile {
			continue
		}
		s.processFile(ctx, filepath.Join(s.blocksDir, f))
	}
	return nil
}

func (s *Syncer) processFile(ctx context.Context, path string) {
	log.Printf("Processing %s", path)

	f, err := os.Open(path)
	if err != nil {
		log.Printf("ERROR opening %s: %v", path, err)
		return
	}
	defer f.Close()

	fileName := filepath.Base(path)
	fileNum := parseBlkNum(fileName)

	var offset int64 = 0
	if s.state.LastFile == fileName {
		offset = s.state.LastOffset
	}

	nextHeight := s.state.LastHeight + 1
	if s.state.LastHeight == 0 && s.state.LastFile == "" {
		nextHeight = 0
	}

	err = parser.ScanBlocksOpts(f, fileNum, offset, s.deobf, func(result parser.BlockScanResult) error {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		if result.Block.Height <= s.state.LastHeight && result.Block.Height != 0 {
			return nil
		}

		result.Block.Height = nextHeight

		if err := s.insertBlock(ctx, result.Block); err != nil {
			log.Printf("ERROR inserting block %d: %v", nextHeight, err)
			return err
		}

		s.mu.Lock()
		s.state.LastHeight = nextHeight
		s.state.LastFile = fileName
		s.state.LastOffset = result.OffsetStart + result.BytesRead
		s.mu.Unlock()

		nextHeight++

		if result.Block.Height%1000 == 0 {
			s.saveState()
			log.Printf("Synced block %d", result.Block.Height)
		}

		return nil
	})

	if err != nil {
		log.Printf("ERROR processing %s: %v", path, err)
	}
	s.saveState()
	log.Printf("Done processing %s", path)
}

func (s *Syncer) insertBlock(ctx context.Context, block *parser.ParsedBlock) error {
	if err := s.client.InsertBlock(ctx, block); err != nil {
		return fmt.Errorf("insert block: %w", err)
	}
	if err := s.client.InsertTransactions(ctx, block); err != nil {
		return fmt.Errorf("insert txs: %w", err)
	}
	if err := s.client.InsertOutputs(ctx, block); err != nil {
		return fmt.Errorf("insert outputs: %w", err)
	}
	if err := s.client.InsertInputs(ctx, block); err != nil {
		return fmt.Errorf("insert inputs: %w", err)
	}
	return nil
}

func (s *Syncer) listBlkFiles() ([]string, error) {
	entries, err := os.ReadDir(s.blocksDir)
	if err != nil {
		return nil, err
	}
	var files []string
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, "blk") && strings.HasSuffix(name, ".dat") {
			files = append(files, name)
		}
	}
	sort.Strings(files)
	return files, nil
}

func (s *Syncer) saveState() {
	s.mu.Lock()
	defer s.mu.Unlock()
	data := fmt.Sprintf(`{"last_height":%d,"last_file":"%s","last_offset":%d}`,
		s.state.LastHeight, s.state.LastFile, s.state.LastOffset)
	os.WriteFile(s.stateFile, []byte(data), 0644)
}

func parseBlkNum(filename string) int {
	base := filepath.Base(filename)
	base = strings.TrimSuffix(strings.TrimPrefix(base, "blk"), ".dat")
	n, _ := strconv.Atoi(base)
	return n
}
