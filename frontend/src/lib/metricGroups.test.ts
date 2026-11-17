import { describe, it, expect } from "vitest";
import { groupByCategory, groupMetrics } from "./metricGroups";

const METRICS = [
  { id: "blocks_hourly", title: "Blocks / hour", category: "network" },
  { id: "blocks_daily", title: "Blocks / day", category: "network" },
  { id: "blocks_weekly", title: "Blocks / week", category: "network" },
  { id: "difficulty_daily", title: "Difficulty / day", category: "mining" },
  { id: "block_stats_daily", title: "Blocks / day", category: "onchain" },
];

describe("groupMetrics", () => {
  it("groups hourly/daily/weekly variants under one key labeled without grain", () => {
    const groups = groupMetrics(METRICS);
    const blocks = groups.find((g) => g.key === "blocks");
    expect(blocks).toBeDefined();
    expect(blocks!.label).toBe("Blocks");
    expect(blocks!.variants.map((v) => v.id).sort()).toEqual([
      "blocks_daily",
      "blocks_hourly",
      "blocks_weekly",
    ]);
  });

  it("keeps single-grain metrics as their own group", () => {
    const groups = groupMetrics(METRICS);
    const diff = groups.find((g) => g.key === "difficulty");
    expect(diff).toBeDefined();
    expect(diff!.variants).toHaveLength(1);
  });

  it("hides legacy aliases", () => {
    const groups = groupMetrics(METRICS);
    expect(groups.flatMap((g) => g.variants.map((v) => v.id))).not.toContain(
      "block_stats_daily",
    );
  });
});

describe("groupByCategory", () => {
  it("buckets groups under their category label", () => {
    const cats = groupByCategory(METRICS);
    const network = cats.find((c) => c.category === "network");
    expect(network).toBeDefined();
    expect(network!.groups.map((g) => g.key)).toContain("blocks");
    const mining = cats.find((c) => c.category === "mining");
    expect(mining!.groups.map((g) => g.key)).toContain("difficulty");
  });
});
