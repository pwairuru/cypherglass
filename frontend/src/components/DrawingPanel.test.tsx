import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DrawingPanel from "./DrawingPanel";
afterEach(() => cleanup());
describe("DrawingPanel", () => {
  it("emits tool activation", () => {
    const onTool = vi.fn();
    render(<DrawingPanel chartKey="k" onTool={onTool} onClear={() => {}} onUndo={() => {}} onExport={() => {}} onImport={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /trend/i }));
    expect(onTool).toHaveBeenCalledWith("trend");
  });
  it("disables rectangle/text (unsupported by QFChart) without calling onTool", () => {
    const onTool = vi.fn();
    render(<DrawingPanel chartKey="k" onTool={onTool} onClear={() => {}} onUndo={() => {}} onExport={() => {}} onImport={() => {}} />);
    const rect = screen.getByRole("button", { name: /rectangle/i });
    const text = screen.getByRole("button", { name: /text/i });
    expect(rect).toBeDisabled();
    expect(text).toBeDisabled();
    fireEvent.click(rect);
    expect(onTool).not.toHaveBeenCalled();
  });
});
