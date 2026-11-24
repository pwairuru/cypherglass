import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DcaLab from "./DcaLab";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2024, 0, 1);
const BARS = [
  { time: T0, close: 100 },
  { time: T0 + DAY, close: 200 },
  { time: T0 + 2 * DAY, close: 400 },
];
const FROM = new Date(T0).toISOString();
const TO = new Date(T0 + 2 * DAY).toISOString();

function renderLab(everyDays = 1) {
  const onAmount = vi.fn();
  const onEveryDays = vi.fn();
  render(
    <DcaLab
      bars={BARS}
      from={FROM}
      to={TO}
      loading={false}
      amount="100"
      onAmount={onAmount}
      everyDays={everyDays}
      onEveryDays={onEveryDays}
    />,
  );
  return { onAmount, onEveryDays };
}

describe("DcaLab", () => {
  afterEach(cleanup);

  it("shows DCA vs lump-sum over the loaded bars", () => {
    renderLab();
    expect(screen.getByText("DCA Lab")).toBeInTheDocument();
    // $100 daily x3 = 1.75 BTC, worth $700 at $400 close.
    expect(screen.getByText("BTC: 1.75000000")).toBeInTheDocument();
    expect(screen.getByText("Value: $700")).toBeInTheDocument();
    // Lump sum $300 at $100 -> 3 BTC -> $1200 wins.
    expect(screen.getByText("Value: $1,200")).toBeInTheDocument();
    expect(screen.getByText("Lump sum wins")).toBeInTheDocument();
  });

  it("switches frequency via segmented control", () => {
    const { onEveryDays } = renderLab();
    fireEvent.click(screen.getByRole("button", { name: "Weekly" }));
    expect(onEveryDays).toHaveBeenCalledWith(7);
  });
});
