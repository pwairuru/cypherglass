import { describe, it, expect } from "vitest";
import { saveDrawings, loadDrawings, importDrawings } from "./drawings";
describe("drawings store", () => {
  it("roundtrips state", () => {
    saveDrawings("test", { lines: [1] });
    expect(loadDrawings("test")).toEqual({ lines: [1] });
  });
  it("rejects corrupt json", () => {
    expect(() => importDrawings("test", "not-json")).toThrow("bad drawings json");
  });
});
