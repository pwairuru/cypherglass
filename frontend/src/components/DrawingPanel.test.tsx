import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DrawingPanel from "./DrawingPanel";
describe("DrawingPanel", () => {
  it("emits tool activation", () => {
    const onTool = vi.fn();
    render(<DrawingPanel chartKey="k" onTool={onTool} onClear={() => {}} onUndo={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /trend/i }));
    expect(onTool).toHaveBeenCalledWith("trend");
  });
});
