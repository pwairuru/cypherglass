import { useState } from "react";
import {
  Download,
  Eraser,
  Minus,
  MoveUpRight,
  Percent,
  Ruler,
  Square,
  TrendingUp,
  Type,
  Undo2,
  Upload,
  type LucideIcon,
} from "lucide-react";

const TOOLS: { name: string; label: string; Icon: LucideIcon }[] = [
  { name: "trend", label: "Trend line", Icon: TrendingUp },
  { name: "horizontal", label: "Horizontal line", Icon: Minus },
  { name: "ray", label: "Ray", Icon: MoveUpRight },
  { name: "fibonacci", label: "Fibonacci retracement", Icon: Percent },
  { name: "measure", label: "Measure", Icon: Ruler },
];
// QFChart 0.8.7 ships no rectangle/text drawing plugins (verified against
// dist/index.d.ts exports), so these stay visible but disabled rather than
// silently activating the wrong tool.
const UNSUPPORTED: { name: string; label: string; Icon: LucideIcon }[] = [
  { name: "rectangle", label: "Rectangle (not supported yet)", Icon: Square },
  { name: "text", label: "Text (not supported yet)", Icon: Type },
];

export default function DrawingPanel({ chartKey: _chartKey, onTool, onClear, onUndo, onExport, onImport }: { chartKey: string; onTool: (n: string) => void; onClear: () => void; onUndo: () => void; onExport: () => void; onImport: () => void }) {
  // chartKey is part of the public contract (Dashboard passes chartKey per
  // card for future per-card persistence); currently unused by the panel
  // itself, which is stateless. Underscore prefix marks intent.
  void _chartKey;
  const [active, setActive] = useState<string | null>(null);
  return (
    <aside aria-label="Drawing tools" className="drawing-panel">
      {TOOLS.map(({ name, label, Icon }) => (
        <button
          key={name}
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={active === name}
          data-active={active === name || undefined}
          onClick={() => {
            setActive(name);
            onTool(name);
          }}
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
      {UNSUPPORTED.map(({ name, label, Icon }) => (
        <button
          key={name}
          type="button"
          disabled
          aria-label={label}
          title={label}
          aria-disabled="true"
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
      <button
        type="button"
        aria-label="Undo drawing"
        title="Undo drawing"
        onClick={onUndo}
      >
        <Undo2 size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Clear drawings"
        title="Clear drawings"
        onClick={onClear}
      >
        <Eraser size={16} aria-hidden="true" />
      </button>
      <span className="drawing-sep" aria-hidden="true" />
      <button
        type="button"
        aria-label="Export drawings"
        title="Export drawings"
        onClick={onExport}
      >
        <Download size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Import drawings"
        title="Import drawings"
        onClick={onImport}
      >
        <Upload size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}
