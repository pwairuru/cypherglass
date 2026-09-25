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
  it("saveDrawings swallows quota errors", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("QuotaExceededError"); };
    try {
      expect(() => saveDrawings("test", { lines: [1] })).not.toThrow();
    } finally {
      Storage.prototype.setItem = orig;
    }
  });
});
