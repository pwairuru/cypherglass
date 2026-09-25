import { useState } from "react";
import {
  Activity,
  AlignLeft,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  AudioWaveform,
  Box,
  Brush,
  Calendar,
  CalendarRange,
  Circle,
  CircleDashed,
  CircleDot,
  Clock,
  Combine,
  Compass,
  Crosshair,
  Diamond,
  DollarSign,
  Download,
  Eraser,
  Eye,
  Fan,
  Flag,
  GitFork,
  Highlighter,
  LayoutGrid,
  MessageCircle,
  MessageSquare,
  Milestone,
  Minus,
  Moon,
  MoveDiagonal,
  MoveHorizontal,
  MoveUpRight,
  MoveVertical,
  Orbit,
  Percent,
  Pin,
  RefreshCcw,
  Rocket,
  RotateCw,
  Route,
  Ruler,
  Share2,
  Slice,
  Spline,
  Split,
  Square,
  StickyNote,
  Table,
  Tag,
  TrendingUp,
  Triangle,
  Type,
  Undo2,
  Upload,
  Waves,
  Workflow,
  type LucideIcon,
} from "lucide-react";

const QUICK: { name: string; label: string; Icon: LucideIcon }[] = [
  { name: "trend", label: "Trend line", Icon: TrendingUp },
  { name: "horizontal", label: "Horizontal line", Icon: Minus },
  { name: "ray", label: "Ray", Icon: MoveUpRight },
  { name: "fibonacci", label: "Fibonacci retracement", Icon: Percent },
  { name: "measure", label: "Measure", Icon: Ruler },
];

interface GroupTool { name: string; label: string; Icon: LucideIcon }
interface Group { id: string; label: string; Icon: LucideIcon; tools: GroupTool[] }

// Names must equal QFChart built-in keys / QFDraw registry type keys:
// onTool(name) -> activateChartTool(chart, name).
const GROUPS: Group[] = [
  {
    id: "lines", label: "Lines", Icon: Spline,
    tools: [{ name: "arrow", label: "Arrow", Icon: ArrowUpRight }],
  },
  {
    id: "channels", label: "Channels", Icon: MoveHorizontal,
    tools: [
      { name: "parallelChannel", label: "Parallel channel", Icon: MoveHorizontal },
      { name: "regressionTrend", label: "Regression trend", Icon: Activity },
      { name: "flatTopBottom", label: "Flat top/bottom", Icon: Minus },
      { name: "disjointChannel", label: "Disjoint channel", Icon: Split },
    ],
  },
  {
    id: "pitchforks", label: "Pitchforks", Icon: GitFork,
    tools: [
      { name: "andrewsPitchfork", label: "Andrews pitchfork", Icon: GitFork },
      { name: "schiffPitchfork", label: "Schiff pitchfork", Icon: Workflow },
      { name: "modifiedSchiffPitchfork", label: "Modified Schiff pitchfork", Icon: Share2 },
      { name: "insidePitchfork", label: "Inside pitchfork", Icon: Combine },
    ],
  },
  {
    id: "fibonacci", label: "Fibonacci", Icon: Percent,
    tools: [
      { name: "fibExtension", label: "Fibonacci extension", Icon: MoveDiagonal },
      { name: "fibTimeZone", label: "Fibonacci time zone", Icon: Clock },
      { name: "fibTimeExtension", label: "Fibonacci time extension", Icon: Calendar },
      { name: "fibCircles", label: "Fibonacci circles", Icon: CircleDashed },
      { name: "fibSpiral", label: "Fibonacci spiral", Icon: RefreshCcw },
      { name: "fibArcs", label: "Fibonacci arcs", Icon: CircleDot },
      { name: "fibWedge", label: "Fibonacci wedge", Icon: Slice },
      { name: "pitchfan", label: "Pitchfan", Icon: Fan },
    ],
  },
  {
    id: "gann", label: "Gann", Icon: Box,
    tools: [
      { name: "gannBox", label: "Gann box", Icon: Box },
      { name: "gannFan", label: "Gann fan", Icon: Compass },
      { name: "gannSquareFixed", label: "Gann square (fixed)", Icon: Square },
      { name: "gannSquare", label: "Gann square", Icon: LayoutGrid },
    ],
  },
  {
    id: "positions", label: "Positions and forecasts", Icon: Crosshair,
    tools: [
      { name: "longPosition", label: "Long position", Icon: ArrowUp },
      { name: "shortPosition", label: "Short position", Icon: ArrowDown },
      { name: "forecast", label: "Forecast", Icon: Eye },
      { name: "barsPattern", label: "Bars pattern", Icon: AlignLeft },
      { name: "projection", label: "Projection", Icon: Rocket },
      { name: "priceRange", label: "Price range", Icon: MoveVertical },
      { name: "datePriceRange", label: "Date and price range", Icon: CalendarRange },
    ],
  },
  {
    id: "shapes", label: "Shapes", Icon: Diamond,
    tools: [
      { name: "rectangle", label: "Rectangle", Icon: Square },
      { name: "rotatedRectangle", label: "Rotated rectangle", Icon: RotateCw },
      { name: "circle", label: "Circle", Icon: Circle },
      { name: "ellipse", label: "Ellipse", Icon: Orbit },
      { name: "triangle", label: "Triangle", Icon: Triangle },
      { name: "arc", label: "Arc", Icon: Moon },
      { name: "path", label: "Path (double-click to finish)", Icon: Route },
      { name: "polyline", label: "Polyline (double-click to finish)", Icon: Spline },
      { name: "curve", label: "Curve", Icon: Waves },
      { name: "doubleCurve", label: "Double curve", Icon: AudioWaveform },
    ],
  },
  {
    id: "annotations", label: "Annotations", Icon: Type,
    tools: [
      { name: "text", label: "Text", Icon: Type },
      { name: "callout", label: "Callout", Icon: MessageSquare },
      { name: "brush", label: "Brush (drag to draw)", Icon: Brush },
      { name: "highlighter", label: "Highlighter (drag to draw)", Icon: Highlighter },
      { name: "arrowMarker", label: "Arrow marker", Icon: ArrowUp },
      { name: "anchoredText", label: "Anchored text", Icon: MessageCircle },
      { name: "note", label: "Note", Icon: StickyNote },
      { name: "priceNote", label: "Price note", Icon: Tag },
      { name: "priceLabel", label: "Price label", Icon: DollarSign },
      { name: "flagMark", label: "Flag", Icon: Flag },
      { name: "pin", label: "Pin", Icon: Pin },
      { name: "comment", label: "Comment", Icon: MessageCircle },
      { name: "signpost", label: "Signpost", Icon: Milestone },
      { name: "table", label: "Table", Icon: Table },
    ],
  },
];

export const PANEL_GROUPS: { id: string; label: string; tools: string[] }[] =
  GROUPS.filter((g) => g.tools.length > 0).map((g) => ({
    id: g.id, label: g.label, tools: g.tools.map((t) => t.name),
  }));

export default function DrawingPanel({ chartKey: _chartKey, onTool, onClear, onUndo, onExport, onImport }: { chartKey: string; onTool: (n: string) => void; onClear: () => void; onUndo: () => void; onExport: () => void; onImport: () => void }) {
  // chartKey is part of the public contract (Dashboard passes chartKey per
  // card for future per-card persistence); currently unused by the panel
  // itself, which is stateless. Underscore prefix marks intent.
  void _chartKey;
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const pick = (name: string) => {
    setActive(name);
    onTool(name);
  };
  return (
    <aside aria-label="Drawing tools" className="drawing-panel">
      {QUICK.map(({ name, label, Icon }) => (
        <button
          key={name}
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={active === name}
          data-active={active === name || undefined}
          onClick={() => pick(name)}
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
      {GROUPS.filter((g) => g.tools.length > 0).map(({ id, label, Icon, tools }) => (
        <div key={id} className="drawing-group">
          <button
            type="button"
            aria-label={`${label} tools`}
            title={`${label} tools`}
            aria-expanded={open === id}
            data-active={open === id || undefined}
            onClick={() => setOpen(open === id ? null : id)}
          >
            <Icon size={16} aria-hidden="true" />
          </button>
          {open === id &&
            tools.map(({ name, label: toolLabel, Icon: ToolIcon }) => (
              <button
                key={name}
                type="button"
                aria-label={toolLabel}
                title={toolLabel}
                aria-pressed={active === name}
                data-active={active === name || undefined}
                data-group-tool={id}
                onClick={() => pick(name)}
              >
                <ToolIcon size={16} aria-hidden="true" />
              </button>
            ))}
        </div>
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
