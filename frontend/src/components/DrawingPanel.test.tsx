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
  it("emits tool activation for the remaining quick tools", () => {
    const onTool = setup();
    fireEvent.click(screen.getByRole("button", { name: /fibonacci retracement/i }));
    fireEvent.click(screen.getByRole("button", { name: /^measure$/i }));
    expect(onTool).toHaveBeenCalledWith("fibonacci");
    expect(onTool).toHaveBeenCalledWith("measure");
  });

  it("groups trend line variants behind the Lines flyout", () => {
    const onTool = setup();
    expect(screen.queryByRole("button", { name: /^horizontal line$/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /lines tools/i }));
    for (const label of [
      /^trend line$/i,
      /^horizontal line$/i,
      /^vertical line$/i,
      /^ray$/i,
      /^horizontal ray$/i,
      /^vertical ray$/i,
      /^extended line$/i,
    ]) {
      expect(screen.getByRole("menuitem", { name: label })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("menuitem", { name: /^horizontal line$/i }));
    expect(onTool).toHaveBeenCalledWith("horizontal-line");
    expect(screen.queryByRole("menu", { name: /lines/i })).not.toBeInTheDocument();
  });
  it("activates rectangle/text via QFDraw registry groups", () => {
    const onTool = setup();
    fireEvent.click(screen.getByRole("button", { name: /shapes tools/i }));
    const rect = screen.getByRole("menuitem", { name: /^rectangle$/i });
    expect(rect).toBeEnabled();
    fireEvent.click(rect);
    fireEvent.click(screen.getByRole("button", { name: /annotations tools/i }));
    const text = screen.getByRole("menuitem", { name: /^text$/i });
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
    expect(screen.getByRole("menuitem", { name: /^gann box$/i })).toBeInTheDocument();
    expect(onTool).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: /^gann fan$/i }));
    expect(onTool).toHaveBeenCalledWith("gannFan");
  });
  it("marks every group with an arrow badge and menu semantics", () => {
    setup();
    for (const g of PANEL_GROUPS) {
      const header = screen.getByRole("button", { name: new RegExp(`${g.label} tools`, "i") });
      expect(header).toHaveAttribute("aria-haspopup", "menu");
      // Tiny arrow indicator inside each group button.
      expect(header.querySelector(".group-arrow")).not.toBeNull();
    }
  });
  it("opens the flyout to the side and closes it on select", () => {
    const onTool = setup();
    fireEvent.click(screen.getByRole("button", { name: /fibonacci tools/i }));
    const menu = screen.getByRole("menu", { name: /fibonacci/i });
    expect(menu).toHaveClass("drawing-flyout");
    fireEvent.click(screen.getByRole("menuitem", { name: /^fibonacci extension$/i }));
    expect(onTool).toHaveBeenCalledWith("fibExtension");
    expect(screen.queryByRole("menu", { name: /fibonacci/i })).not.toBeInTheDocument();
  });
  it("closes the flyout on Escape", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /gann tools/i }));
    expect(screen.getByRole("menu", { name: /gann/i })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: /gann/i })).not.toBeInTheDocument();
  });
});
