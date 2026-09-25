export default function DrawingPanel({ chartKey, onTool, onClear, onUndo }: { chartKey: string; onTool: (n: string) => void; onClear: () => void; onUndo: () => void }) {
  const tools = ["trend", "horizontal", "ray", "rectangle", "fibonacci", "measure", "text"];
  return (
    <aside aria-label="Drawing tools" className="drawing-panel">
      {tools.map((t) => <button key={t} type="button" onClick={() => onTool(t)}>{t}</button>)}
      <button type="button" onClick={onUndo}>Undo</button>
      <button type="button" onClick={onClear}>Clear</button>
    </aside>
  );
}
