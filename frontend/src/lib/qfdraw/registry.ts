// frontend/src/lib/qfdraw/registry.ts
// Attribution: drawing set ported from lightweight-charts-drawing (MIT).
import type { Plugin, QFChart } from "@qfo/qfchart";
import type { QfCreateMode } from "./base";
import { ArrowDrawingRenderer, ArrowTool } from "./tools/lines/arrow";
import { ParallelChannelRenderer, ParallelChannelTool, RegressionTrendRenderer, RegressionTrendTool, FlatTopBottomRenderer, FlatTopBottomTool, DisjointChannelRenderer, DisjointChannelTool } from "./tools/channels/channels";
import { AndrewsPitchforkRenderer, AndrewsPitchforkTool, SchiffPitchforkRenderer, SchiffPitchforkTool, ModifiedSchiffPitchforkRenderer, ModifiedSchiffPitchforkTool, InsidePitchforkRenderer, InsidePitchforkTool } from "./tools/pitchforks/pitchforks";
import { FibExtensionRenderer, FibExtensionTool, FibTimeZoneRenderer, FibTimeZoneTool, FibTimeExtensionRenderer, FibTimeExtensionTool, FibCirclesRenderer, FibCirclesTool, FibSpiralRenderer, FibSpiralTool, FibArcsRenderer, FibArcsTool, FibWedgeRenderer, FibWedgeTool, PitchfanRenderer, PitchfanTool } from "./tools/fibonacci/extras";
import { GannBoxRenderer, GannBoxTool, GannFanRenderer, GannFanTool, GannSquareFixedRenderer, GannSquareFixedTool, GannSquareRenderer, GannSquareTool } from "./tools/gann/gann";
import { LongPositionRenderer, LongPositionTool, ShortPositionRenderer, ShortPositionTool, ForecastRenderer, ForecastTool, BarsPatternRenderer, BarsPatternTool, ProjectionRenderer, ProjectionTool, PriceRangeRenderer, PriceRangeTool, DatePriceRangeRenderer, DatePriceRangeTool } from "./tools/forecast/forecast";
import { RectangleRenderer, RectangleTool, RotatedRectangleRenderer, RotatedRectangleTool, CircleRenderer, CircleTool, EllipseRenderer, EllipseTool, TriangleRenderer, TriangleTool, ArcRenderer, ArcTool, PathRenderer, PathTool, PolylineRenderer, PolylineTool, CurveRenderer, CurveTool, DoubleCurveRenderer, DoubleCurveTool } from "./tools/shapes/shapes";
import { TextRenderer, TextTool, CalloutRenderer, CalloutTool, BrushRenderer, BrushTool, HighlighterRenderer, HighlighterTool, ArrowMarkerRenderer, ArrowMarkerTool, AnchoredTextRenderer, AnchoredTextTool, NoteRenderer, NoteTool, PriceNoteRenderer, PriceNoteTool, PriceLabelRenderer, PriceLabelTool, FlagMarkRenderer, FlagMarkTool, PinRenderer, PinTool, CommentRenderer, CommentTool, SignpostRenderer, SignpostTool, TableRenderer, TableTool } from "./tools/annotations/annotations";

export const TOOL_TYPES = ["arrow","parallelChannel","regressionTrend","flatTopBottom","disjointChannel","andrewsPitchfork","schiffPitchfork","modifiedSchiffPitchfork","insidePitchfork","fibExtension","fibTimeZone","fibTimeExtension","fibCircles","fibSpiral","fibArcs","fibWedge","pitchfan","gannBox","gannFan","gannSquareFixed","gannSquare","longPosition","shortPosition","forecast","barsPattern","projection","priceRange","datePriceRange","rectangle","rotatedRectangle","circle","ellipse","triangle","arc","path","polyline","curve","doubleCurve","text","callout","brush","highlighter","arrowMarker","anchoredText","note","priceNote","priceLabel","flagMark","pin","comment","signpost","table"];

/** Creation contract per drawing type: fixed anchor count (0 = variable,
 * dblclick finishes, min 2) and click vs freehand-drag mode. Counts match
 * what each DrawingRenderer reads from pixelPoints. */
export const ANCHORS: Record<string, { n: number; mode: QfCreateMode }> = {
  arrow: { n: 2, mode: "click" },
  parallelChannel: { n: 3, mode: "click" },
  regressionTrend: { n: 2, mode: "click" },
  flatTopBottom: { n: 3, mode: "click" },
  disjointChannel: { n: 4, mode: "click" },
  andrewsPitchfork: { n: 3, mode: "click" },
  schiffPitchfork: { n: 3, mode: "click" },
  modifiedSchiffPitchfork: { n: 3, mode: "click" },
  insidePitchfork: { n: 3, mode: "click" },
  fibExtension: { n: 3, mode: "click" },
  fibTimeZone: { n: 2, mode: "click" },
  fibTimeExtension: { n: 3, mode: "click" },
  fibCircles: { n: 2, mode: "click" },
  fibSpiral: { n: 2, mode: "click" },
  fibArcs: { n: 2, mode: "click" },
  fibWedge: { n: 3, mode: "click" },
  pitchfan: { n: 3, mode: "click" },
  gannBox: { n: 2, mode: "click" },
  gannFan: { n: 2, mode: "click" },
  gannSquareFixed: { n: 1, mode: "click" },
  gannSquare: { n: 2, mode: "click" },
  longPosition: { n: 2, mode: "click" },
  shortPosition: { n: 2, mode: "click" },
  forecast: { n: 2, mode: "click" },
  barsPattern: { n: 3, mode: "click" },
  projection: { n: 3, mode: "click" },
  priceRange: { n: 2, mode: "click" },
  datePriceRange: { n: 2, mode: "click" },
  rectangle: { n: 2, mode: "click" },
  rotatedRectangle: { n: 3, mode: "click" },
  circle: { n: 2, mode: "click" },
  ellipse: { n: 2, mode: "click" },
  triangle: { n: 3, mode: "click" },
  arc: { n: 2, mode: "click" },
  path: { n: 0, mode: "click" },
  polyline: { n: 0, mode: "click" },
  curve: { n: 4, mode: "click" },
  doubleCurve: { n: 3, mode: "click" },
  text: { n: 1, mode: "click" },
  callout: { n: 2, mode: "click" },
  brush: { n: 0, mode: "drag" },
  highlighter: { n: 0, mode: "drag" },
  arrowMarker: { n: 1, mode: "click" },
  anchoredText: { n: 2, mode: "click" },
  note: { n: 1, mode: "click" },
  priceNote: { n: 1, mode: "click" },
  priceLabel: { n: 1, mode: "click" },
  flagMark: { n: 1, mode: "click" },
  pin: { n: 1, mode: "click" },
  comment: { n: 1, mode: "click" },
  signpost: { n: 1, mode: "click" },
  table: { n: 1, mode: "click" },
};

export function registerAllQfDrawings(chart: QFChart): Record<string, Plugin> {
  const pairs: [string, any, any][] = [
    ["arrow", ArrowDrawingRenderer, ArrowTool],
    ["parallelChannel", ParallelChannelRenderer, ParallelChannelTool],
    ["regressionTrend", RegressionTrendRenderer, RegressionTrendTool],
    ["flatTopBottom", FlatTopBottomRenderer, FlatTopBottomTool],
    ["disjointChannel", DisjointChannelRenderer, DisjointChannelTool],
    ["andrewsPitchfork", AndrewsPitchforkRenderer, AndrewsPitchforkTool],
    ["schiffPitchfork", SchiffPitchforkRenderer, SchiffPitchforkTool],
    ["modifiedSchiffPitchfork", ModifiedSchiffPitchforkRenderer, ModifiedSchiffPitchforkTool],
    ["insidePitchfork", InsidePitchforkRenderer, InsidePitchforkTool],
    ["fibExtension", FibExtensionRenderer, FibExtensionTool],
    ["fibTimeZone", FibTimeZoneRenderer, FibTimeZoneTool],
    ["fibTimeExtension", FibTimeExtensionRenderer, FibTimeExtensionTool],
    ["fibCircles", FibCirclesRenderer, FibCirclesTool],
    ["fibSpiral", FibSpiralRenderer, FibSpiralTool],
    ["fibArcs", FibArcsRenderer, FibArcsTool],
    ["fibWedge", FibWedgeRenderer, FibWedgeTool],
    ["pitchfan", PitchfanRenderer, PitchfanTool],
    ["gannBox", GannBoxRenderer, GannBoxTool],
    ["gannFan", GannFanRenderer, GannFanTool],
    ["gannSquareFixed", GannSquareFixedRenderer, GannSquareFixedTool],
    ["gannSquare", GannSquareRenderer, GannSquareTool],
    ["longPosition", LongPositionRenderer, LongPositionTool],
    ["shortPosition", ShortPositionRenderer, ShortPositionTool],
    ["forecast", ForecastRenderer, ForecastTool],
    ["barsPattern", BarsPatternRenderer, BarsPatternTool],
    ["projection", ProjectionRenderer, ProjectionTool],
    ["priceRange", PriceRangeRenderer, PriceRangeTool],
    ["datePriceRange", DatePriceRangeRenderer, DatePriceRangeTool],
    ["rectangle", RectangleRenderer, RectangleTool],
    ["rotatedRectangle", RotatedRectangleRenderer, RotatedRectangleTool],
    ["circle", CircleRenderer, CircleTool],
    ["ellipse", EllipseRenderer, EllipseTool],
    ["triangle", TriangleRenderer, TriangleTool],
    ["arc", ArcRenderer, ArcTool],
    ["path", PathRenderer, PathTool],
    ["polyline", PolylineRenderer, PolylineTool],
    ["curve", CurveRenderer, CurveTool],
    ["doubleCurve", DoubleCurveRenderer, DoubleCurveTool],
    ["text", TextRenderer, TextTool],
    ["callout", CalloutRenderer, CalloutTool],
    ["brush", BrushRenderer, BrushTool],
    ["highlighter", HighlighterRenderer, HighlighterTool],
    ["arrowMarker", ArrowMarkerRenderer, ArrowMarkerTool],
    ["anchoredText", AnchoredTextRenderer, AnchoredTextTool],
    ["note", NoteRenderer, NoteTool],
    ["priceNote", PriceNoteRenderer, PriceNoteTool],
    ["priceLabel", PriceLabelRenderer, PriceLabelTool],
    ["flagMark", FlagMarkRenderer, FlagMarkTool],
    ["pin", PinRenderer, PinTool],
    ["comment", CommentRenderer, CommentTool],
    ["signpost", SignpostRenderer, SignpostTool],
    ["table", TableRenderer, TableTool],
  ];
  const map: Record<string, Plugin> = {};
  for (const [name, R, T] of pairs) {
    chart.registerDrawingRenderer(new R());
    const tool = new T() as import("./base").QfTool;
    const spec = ANCHORS[name];
    if (spec) {
      tool.drawingType = name;
      tool.anchorCount = spec.n;
      tool.mode = spec.mode;
    }
    chart.registerPlugin(tool);
    map[name] = tool;
  }
  return map;
}
