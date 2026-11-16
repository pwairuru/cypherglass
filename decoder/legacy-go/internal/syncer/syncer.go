package syncer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/freegoup/decoder/internal/clickhouse"
	"github.com/freegoup/decoder/internal/enrich"
	"github.com/freegoup/decoder/internal/parser"
	"github.com/fsnotify/fsnotify"
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
	utxo      *enrich.UTXOMap
	prevTime  time.Time
	prevHash  string
}

func New(client *clickhouse.Client, blocksDir, stateFile string, state *SyncState) *Syncer {
	return &Syncer{
		client:    client,
		blocksDir: blocksDir,
		state:     state,
		stateFile: stateFile,
		stopCh:    make(chan struct{}),
		deobf:     loadDeobfuscator(blocksDir),
		utxo:      enrich.NewUTXOMap(),
	}
}

// blkFileRe strictly matches Bitcoin Core block file names (blkNNNNN.dat).
// Anything else (traversal, absolute paths, odd names) is rejected before open.
var blkFileRe = regexp.MustCompile(`^blk[0-9]+\.dat$`)

// resolveBlkPath confines an event/listed path to blocksDir: strict name
// match, symlink resolution, and prefix containment. A symlink inside
// blocksDir pointing outside (e.g. blk99999.dat -> /etc/passwd) is rejected.
func resolveBlkPath(blocksDir, path string) (string, error) {
	base := filepath.Base(path)
	if !blkFileRe.MatchString(base) {
		return "", fmt.Errorf("not a block file: %q", base)
	}
	dirAbs, err := filepath.Abs(blocksDir)
	if err != nil {
		return "", err
	}
	candidate := filepath.Join(dirAbs, base)
	resolved, err := filepath.EvalSymlinks(candidate)
	if err != nil {
		if os.IsNotExist(err) {
			// Racy delete between event and open: not fatal, caller skips.
			return "", err
		}
		return "", err
	}
	resolvedAbs, err := filepath.Abs(resolved)
	if err != nil {
		return "", err
	}
	if resolvedAbs != dirAbs && !strings.HasPrefix(resolvedAbs, dirAbs+string(os.PathSeparator)) {
		return "", fmt.Errorf("block file escapes data dir: %q", path)
	}
	return resolvedAbs, nil
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
				resolved, err := resolveBlkPath(s.blocksDir, event.Name)
				if err != nil {
					continue
				}
				time.Sleep(2 * time.Second)
				s.processFile(ctx, resolved)
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
	resolved, err := resolveBlkPath(s.blocksDir, path)
	if err != nil {
		log.Printf("Skipping untrusted block path %q: %v", path, err)
		return
	}
	path = resolved
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

		// Prefer parser height (BIP34 coinbase); fall back to sequential
		// only for pre-BIP34 blocks where height is 0.
		height := result.Block.Height
		if height == 0 {
			height = nextHeight
			result.Block.Height = height
		}
		// Reorg detection: prev_hash must link to previous block hash.
		prev := result.Block.Header.PrevBlock.String()
		if s.prevHash != "" && prev != "" && prev != s.prevHash && height != 0 {
			log.Printf("REORG suspected at height %d: prev %s != last %s (keeping both, needs backfill)", height, prev, s.prevHash)
		}

		if err := s.insertBlock(ctx, result.Block); err != nil {
			log.Printf("ERROR inserting block %d: %v", height, err)
			return err
		}

		s.mu.Lock()
		s.state.LastHeight = height
		s.state.LastFile = fileName
		s.state.LastOffset = result.OffsetStart + result.BytesRead
		s.mu.Unlock()

		s.prevHash = result.Block.Hash.String()
		nextHeight = height + 1

		if height%1000 == 0 {
			s.saveState()
			log.Printf("Synced block %d", height)
		}

		return nil
	})

	if err != nil {
		log.Printf("ERROR processing %s: %v", path, err)
		// Do NOT checkpoint past a failed block: offsets in state still
		// point at last success (updated incrementally above).
		return
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
	// Pass 1: index ALL of the block's outputs first, so V2 input
	// resolution below also hits spends of same-block outputs.
	for _, tx := range block.Transactions {
		txid := tx.Hash.String()
		for _, out := range tx.Outputs {
			if out.ValueSat >= 0 {
				s.utxo.Put(txid, out.Index, uint64(out.ValueSat))
			}
		}
	}
	// V2 inserts resolve input values from the UTXO map (now including
	// same-block outputs).
	if err := s.client.InsertBlockV2(ctx, block, s.prevTime); err != nil {
		return fmt.Errorf("insert block v2: %w", err)
	}
	if err := s.client.InsertTransactionsV2(ctx, block, s.utxo); err != nil {
		return fmt.Errorf("insert txs v2: %w", err)
	}
	if err := s.client.InsertInputsV2(ctx, block, s.utxo); err != nil {
		return fmt.Errorf("insert inputs v2: %w", err)
	}
	if err := s.client.InsertOutputsV2(ctx, block); err != nil {
		return fmt.Errorf("insert outputs v2: %w", err)
	}
	// Pass 2: remove spent entries (including same-block spends indexed above).
	for _, tx := range block.Transactions {
		if tx.IsCoinbase {
			continue
		}
		for _, in := range tx.Inputs {
			s.utxo.Delete(in.PrevTxID.String(), in.PrevIndex)
		}
	}
	s.prevTime = block.Header.Timestamp
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
	// encoding/json (not Sprintf): file names can never break state integrity.
	data, err := json.Marshal(s.state)
	if err != nil {
		log.Printf("ERROR marshaling state: %v", err)
		return
	}
	os.WriteFile(s.stateFile, data, 0600)
}

func parseBlkNum(filename string) int {
	base := filepath.Base(filename)
	base = strings.TrimSuffix(strings.TrimPrefix(base, "blk"), ".dat")
	n, _ := strconv.Atoi(base)
	return n
}
