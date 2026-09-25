// frontend/src/lib/qfdraw/registry.ts
// Attribution: drawing set ported from lightweight-charts-drawing (MIT).
import type { Plugin, QFChart } from "@qfo/qfchart";
import { ArrowDrawingRenderer, ArrowTool } from "./tools/lines/arrow";
import { ParallelChannelRenderer, ParallelChannelTool, RegressionTrendRenderer, RegressionTrendTool, FlatTopBottomRenderer, FlatTopBottomTool, DisjointChannelRenderer, DisjointChannelTool } from "./tools/channels/channels";
import { AndrewsPitchforkRenderer, AndrewsPitchforkTool, SchiffPitchforkRenderer, SchiffPitchforkTool, ModifiedSchiffPitchforkRenderer, ModifiedSchiffPitchforkTool, InsidePitchforkRenderer, InsidePitchforkTool } from "./tools/pitchforks/pitchforks";
import { FibExtensionRenderer, FibExtensionTool, FibTimeZoneRenderer, FibTimeZoneTool, FibTimeExtensionRenderer, FibTimeExtensionTool, FibCirclesRenderer, FibCirclesTool, FibSpiralRenderer, FibSpiralTool, FibArcsRenderer, FibArcsTool, FibWedgeRenderer, FibWedgeTool, PitchfanRenderer, PitchfanTool } from "./tools/fibonacci/extras";
import { GannBoxRenderer, GannBoxTool, GannFanRenderer, GannFanTool, GannSquareFixedRenderer, GannSquareFixedTool, GannSquareRenderer, GannSquareTool } from "./tools/gann/gann";
import { LongPositionRenderer, LongPositionTool, ShortPositionRenderer, ShortPositionTool, ForecastRenderer, ForecastTool, BarsPatternRenderer, BarsPatternTool, ProjectionRenderer, ProjectionTool, PriceRangeRenderer, PriceRangeTool, DatePriceRangeRenderer, DatePriceRangeTool } from "./tools/forecast/forecast";
import { RectangleRenderer, RectangleTool, RotatedRectangleRenderer, RotatedRectangleTool, CircleRenderer, CircleTool, EllipseRenderer, EllipseTool, TriangleRenderer, TriangleTool, ArcRenderer, ArcTool, PathRenderer, PathTool, PolylineRenderer, PolylineTool, CurveRenderer, CurveTool, DoubleCurveRenderer, DoubleCurveTool } from "./tools/shapes/shapes";
import { TextRenderer, TextTool, CalloutRenderer, CalloutTool, BrushRenderer, BrushTool, HighlighterRenderer, HighlighterTool, ArrowMarkerRenderer, ArrowMarkerTool, AnchoredTextRenderer, AnchoredTextTool, NoteRenderer, NoteTool, PriceNoteRenderer, PriceNoteTool, PriceLabelRenderer, PriceLabelTool, FlagMarkRenderer, FlagMarkTool, PinRenderer, PinTool, CommentRenderer, CommentTool, SignpostRenderer, SignpostTool, TableRenderer, TableTool } from "./tools/annotations/annotations";

export const TOOL_TYPES = ["arrow","parallelChannel","regressionTrend","flatTopBottom","disjointChannel","andrewsPitchfork","schiffPitchfork","modifiedSchiffPitchfork","insidePitchfork","fibExtension","fibTimeZone","fibTimeExtension","fibCircles","fibSpiral","fibArcs","fibWedge","pitchfan","gannBox","gannFan","gannSquareFixed","gannSquare","longPosition","shortPosition","forecast","barsPattern","projection","priceRange","datePriceRange","rectangle","rotatedRectangle","circle","ellipse","triangle","arc","path","polyline","curve","doubleCurve","text","callout","brush","highlighter","arrowMarker","anchoredText","note","priceNote","priceLabel","flagMark","pin","comment","signpost","table"];

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
    const tool = new T();
    chart.registerPlugin(tool);
    map[name] = tool;
  }
  return map;
}
