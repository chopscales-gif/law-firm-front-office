import { describe, expect, it } from "vitest";
import { completedIntake, offerSlots, respond, startChat, type ChatTurn } from "./engine";
import { SCENARIOS } from "./scenarios";

function play(key: string): { turns: ChatTurn[]; last: ChatTurn } {
  const scenario = SCENARIOS.find((s) => s.key === key)!;
  let turn = startChat(offerSlots(new Date("2026-11-13T18:00:00Z")));
  const turns: ChatTurn[] = [];
  for (const message of scenario.messages) {
    turn = respond(turn.state, message);
    turns.push(turn);
  }
  return { turns, last: turn };
}

describe("demo scenarios", () => {
  it("every scenario ends in a completed intake with no wasted messages", () => {
    for (const scenario of SCENARIOS) {
      const { turns, last } = play(scenario.key);
      expect(last.state.status, scenario.key).toBe("complete");
      // The conversation must not finish before the script does.
      expect(turns.slice(0, -1).every((t) => t.state.status === "collecting"), scenario.key).toBe(true);
    }
  });

  it("clean inquiry: estate plan with a booked consultation", () => {
    const intake = completedIntake(play("clean").last.state)!;
    expect(intake).toMatchObject({
      matterType: "trust",
      name: "Dana Whitlock",
      adverseName: null,
      relatedNames: ["Owen Whitlock"],
      county: "Salt Lake",
      urgency: "planning",
      email: "dana.whitlock@mail.example",
      source: "referral",
    });
    expect(intake.phone).toContain("0142");
    expect(intake.consultAt).not.toBeNull();
  });

  it("conflict inquiry: names the other side as given", () => {
    const intake = completedIntake(play("conflict").last.state)!;
    expect(intake).toMatchObject({ matterType: "divorce", name: "Marcus Bell", adverseName: "Kate Reyes", urgency: "soon" });
    expect(intake.signals).toEqual({ children: true, realEstate: true });
  });

  it("advice scenario: declines twice and still completes", () => {
    const { turns, last } = play("advice");
    expect(turns.filter((t) => t.guardrail === "advice")).toHaveLength(2);
    const intake = completedIntake(last.state)!;
    expect(intake).toMatchObject({ matterType: "custody", name: "Priya Raman", adverseName: "Tomas Raman", county: "Davis", urgency: "soon", consultAt: null });
  });
});
