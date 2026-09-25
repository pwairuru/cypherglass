import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DrawingPanel, { PANEL_GROUPS } from "./DrawingPanel";
import { TOOL_TYPES } from "../lib/qfdraw/registry";
afterEach(() => cleanup());
function setup() {
  const onTool = vi.fn();
  render(<DrawingPanel chartKey="k" onTool={onTool} onClear={() => {}} onUndo={() => {}} onExport={() => {}} onImport={() => {}} />);
  return onTool;
}
describe("DrawingPanel", () => {
  it("emits tool activation", () => {
    const onTool = setup();
    fireEvent.click(screen.getByRole("button", { name: /trend/i }));
    expect(onTool).toHaveBeenCalledWith("trend");
  });
  it("activates rectangle/text via QFDraw registry groups", () => {
    const onTool = setup();
    fireEvent.click(screen.getByRole("button", { name: /shapes tools/i }));
    const rect = screen.getByRole("button", { name: /^rectangle$/i });
    expect(rect).toBeEnabled();
    fireEvent.click(rect);
    fireEvent.click(screen.getByRole("button", { name: /annotations tools/i }));
    const text = screen.getByRole("button", { name: /^text$/i });
    expect(text).toBeEnabled();
    fireEvent.click(text);
    expect(onTool).toHaveBeenCalledWith("rectangle");
    expect(onTool).toHaveBeenCalledWith("text");
  });
  it("exposes every registered QFDraw type through a group", () => {
    const panelTools = new Set(PANEL_GROUPS.flatMap((g) => g.tools));
    for (const type of TOOL_TYPES) {
      expect(panelTools.has(type), type).toBe(true);
    }
  });
  it("group headers toggle open without emitting a tool", () => {
    const onTool = setup();
    fireEvent.click(screen.getByRole("button", { name: /gann tools/i }));
    expect(screen.getByRole("button", { name: /^gann box$/i })).toBeInTheDocument();
    expect(onTool).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^gann fan$/i }));
    expect(onTool).toHaveBeenCalledWith("gannFan");
  });
});
