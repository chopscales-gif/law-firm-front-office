import { describe, expect, it } from "vitest";
import { scoreLead } from "./scoring";

const base = {
  matterType: "divorce" as const,
  state: "Utah",
  county: "Salt Lake",
  urgency: "deadline" as const,
  signals: { children: true, realEstate: true },
  email: "a@example.test",
  phone: "801-555-0101",
  source: "referral" as const,
};

describe("lead scoring", () => {
  it("gives a referred, urgent, local family matter the full 100", () => {
    const score = scoreLead(base);
    expect(score.total).toBe(100);
    expect(score.tier).toBe("hot");
  });
  it("adds up to exactly the sum of its factors", () => {
    const score = scoreLead({ ...base, urgency: "planning", source: "search", phone: null, signals: {} });
    expect(score.total).toBe(score.factors.reduce((sum, f) => sum + f.points, 0));
    expect(score.total).toBe(30 + 20 + 6 + 0 + 5 + 5);
    expect(score.tier).toBe("warm");
  });
  it("scores Utah outside the home counties lower than inside", () => {
    expect(scoreLead({ ...base, county: "Cache" }).total).toBeLessThan(scoreLead(base).total);
  });
  it("gives no location points outside Utah", () => {
    const location = scoreLead({ ...base, state: "Idaho", county: null }).factors.find((f) => f.label === "Location");
    expect(location?.points).toBe(0);
  });
  it("never rates a matter outside the practice areas above cool", () => {
    const score = scoreLead({ ...base, matterType: "outside" });
    expect(score.tier).toBe("cool");
    expect(score.factors[0].points).toBe(0);
  });
  it("keeps every factor within its maximum", () => {
    for (const factor of scoreLead(base).factors) expect(factor.points).toBeLessThanOrEqual(factor.max);
  });
});
