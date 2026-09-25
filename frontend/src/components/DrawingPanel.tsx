const TOOLS = ["trend", "horizontal", "ray", "fibonacci", "measure"] as const;
// QFChart 0.8.7 ships no rectangle/text drawing plugins (verified against
// dist/index.d.ts exports), so these stay visible but disabled rather than
// silently activating the wrong tool.
const UNSUPPORTED = ["rectangle", "text"] as const;

export default function DrawingPanel({ chartKey, onTool, onClear, onUndo }: { chartKey: string; onTool: (n: string) => void; onClear: () => void; onUndo: () => void }) {
  return (
    <aside aria-label="Drawing tools" className="drawing-panel">
      {TOOLS.map((t) => <button key={t} type="button" onClick={() => onTool(t)}>{t}</button>)}
      {UNSUPPORTED.map((t) => <button key={t} type="button" disabled title="Not supported by the chart library yet" aria-disabled="true">{t}</button>)}
      <button type="button" onClick={onUndo}>Undo</button>
      <button type="button" onClick={onClear}>Clear</button>
    </aside>
  );
}
