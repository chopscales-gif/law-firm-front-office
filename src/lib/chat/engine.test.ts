import { describe, expect, it } from "vitest";
import { classifyMatter, completedIntake, extractName, offerSlots, respond, startChat, type ChatState } from "./engine";
import { asksForLegalAdvice, mentionsSafetyRisk, NO_ADVICE_REPLY, SELF_HARM_REPLY } from "./guardrail";

const slots = offerSlots(new Date("2026-11-13T18:00:00Z"));

function run(messages: string[]): { state: ChatState; transcript: string[] } {
  let state = startChat(slots).state;
  const transcript: string[] = [];
  for (const message of messages) {
    const turn = respond(state, message);
    state = turn.state;
    transcript.push(...turn.replies);
  }
  return { state, transcript };
}

describe("guardrails", () => {
  it.each([
    "Should I move out of the house?",
    "Can my ex take the kids out of state?",
    "What are my rights here",
    "is it legal for him to sell the house",
    "How much child support will I get?",
    "Do I have a case?",
    "what happens if I just don't respond",
    "Will I lose custody",
  ])("refuses: %s", (message) => {
    expect(asksForLegalAdvice(message)).toBe(true);
  });

  it.each([
    "Dana Whitlock",
    "I need help with a divorce",
    "Can I book a consultation for Tuesday?",
    "Will I get a confirmation email?",
    "dana@example.test",
    "Salt Lake County",
  ])("does not refuse: %s", (message) => {
    expect(asksForLegalAdvice(message)).toBe(false);
  });

  it("spots safety concerns", () => {
    expect(mentionsSafetyRisk("he has been threatening me")).toBe(true);
    expect(mentionsSafetyRisk("we want a simple will")).toBe(false);
  });
});

describe("parsing", () => {
  it("classifies matters", () => {
    expect(classifyMatter("my wife and I are separating")).toBe("divorce");
    expect(classifyMatter("A will or trust")).toBe("trust");
    expect(classifyMatter("my dad passed away last month")).toBe("probate");
    expect(classifyMatter("I got a DUI")).toBe("outside");
    expect(classifyMatter("hello")).toBeNull();
  });
  it("pulls names out of conversational answers", () => {
    expect(extractName("my name is dana whitlock")).toBe("Dana Whitlock");
    expect(extractName("My soon-to-be ex-wife, Kate Reyes.")).toBe("Kate Reyes");
    expect(extractName("it's Will Smith")).toBe("Will Smith");
    expect(extractName("sean o'malley-reyes")).toBe("Sean O'Malley-Reyes");
    expect(extractName("I need a divorce")).toBeNull();
    expect(extractName("why do you need that?")).toBeNull();
  });
  it("offers three weekday slots", () => {
    expect(slots).toHaveLength(3);
    expect(slots[0].label).toBe("Monday Nov 16, 10 am");
  });
});

describe("conversation", () => {
  it("collects a full estate-planning intake", () => {
    const { state } = run([
      "A will or trust",
      "Dana Whitlock",
      "my husband Owen Whitlock",
      "Salt Lake County",
      "Just planning ahead",
      "A home",
      "dana.whitlock@example.test, 801-555-0188",
      "A friend or family member",
      slots[1].label,
    ]);
    expect(completedIntake(state)).toMatchObject({
      matterType: "trust",
      name: "Dana Whitlock",
      adverseName: null,
      relatedNames: ["Owen Whitlock"],
      state: "Utah",
      county: "Salt Lake",
      urgency: "planning",
      signals: { realEstate: true },
      email: "dana.whitlock@example.test",
      phone: "801-555-0188",
      source: "referral",
      consultAt: slots[1].iso,
      safetyConcern: false,
    });
  });

  it("records the other side in a family matter as adverse", () => {
    const { state } = run(["I need a divorce", "Marcus Bell", "my wife, Kate Reyes"]);
    expect(state.data.adverseName).toBe("Kate Reyes");
    expect(state.data.matterType).toBe("divorce");
  });

  it("refuses legal advice, keeps its place, and still finishes", () => {
    let state = run(["Child custody", "Priya Nair"]).state;
    const turn = respond(state, "Can my ex take the kids out of state? What should I do?");
    expect(turn.guardrail).toBe("advice");
    expect(turn.replies[0]).toBe(NO_ADVICE_REPLY);
    expect(turn.state.answered).not.toContain("otherParty");
    expect(turn.replies[1]).toContain("other person's first and last name");
    state = respond(turn.state, "Arjun Nair").state;
    expect(state.data.adverseName).toBe("Arjun Nair");
  });

  it("takes the matter type from an opening question but still refuses to answer it", () => {
    const turn = respond(startChat(slots).state, "Can my ex take the kids out of state?");
    expect(turn.guardrail).toBe("advice");
    expect(turn.state.answered).toEqual(["matter"]);
  });

  it("flags a safety concern and carries on", () => {
    const { state, transcript } = run(["divorce", "Elena Marsh", "My husband Cole Marsh, he has been threatening me"]);
    expect(state.data.safetyConcern).toBe(true);
    expect(transcript.join(" ")).toContain("call 911");
    expect(state.data.adverseName).toBe("Cole Marsh");
  });

  it("ends politely when the matter is outside the firm's practice", () => {
    const { state, transcript } = run(["I was in a car accident"]);
    expect(state.status).toBe("outside");
    expect(transcript.at(-1)).toContain("only handles family law and estate planning");
  });

  it("keeps contact details given early and skips that question later", () => {
    const { state } = run(["probate", "Tomas Vidal, you can reach me at tomas@example.test"]);
    expect(state.data.email).toBe("tomas@example.test");
    expect(state.answered).toContain("contact");
  });

  it("re-asks when it cannot read an answer", () => {
    const turn = respond(run(["divorce", "Marcus Bell", "Kate Reyes"]).state, "blue");
    expect(turn.replies[0]).toContain("didn't catch that");
    expect(turn.state.answered).not.toContain("location");
  });

  it("answers a question about fees without treating it as legal advice", () => {
    const turn = respond(run(["divorce"]).state, "How much does the consultation cost?");
    expect(turn.guardrail).toBeNull();
    expect(turn.replies[0]).toContain("free");
  });

  it("lets a model supply slots but never switch off the guardrail", () => {
    const turn = respond(run(["divorce"]).state, "should I hide my savings?", {
      slots: { name: "Hide Savings" },
      answered: ["name"],
      asksLegalAdvice: false,
    });
    expect(turn.guardrail).toBe("advice");
  });
});

describe("things a reviewer broke once", () => {
  it.each(["Will you help me?", "I don't trust my husband", "I want to adopt a dog", "Can you call me back?"])(
    "does not take an everyday phrase for a matter: %s",
    (message) => {
      expect(run([message]).state.data.matterType).toBeUndefined();
    },
  );

  it.each([
    ["I need a will", "will"],
    ["A will or trust", "trust"],
    ["a living trust", "trust"],
    ["my mom passed away", "probate"],
    ["I want to adopt my stepson", "adoption"],
  ] as const)("still recognizes: %s", (message, matter) => {
    expect(classifyMatter(message)).toBe(matter);
  });

  it.each(["I want to sue my ex", "my dad died in a car accident"])("sends work the firm does not do elsewhere: %s", (message) => {
    expect(run([message]).state.status).toBe("outside");
  });

  it.each(["Is adultery grounds for divorce in Utah?", "Can I take the kids out of state before my appointment?", "Does he get the house?"])(
    "refuses a legal question however it is phrased: %s",
    (message) => {
      expect(run([message]).transcript).toContain(NO_ADVICE_REPLY);
    },
  );

  it("does not refuse a question about the firm, or an answer with a question mark", () => {
    expect(run(["Is the consultation free?"]).transcript).not.toContain(NO_ADVICE_REPLY);
    const { state, transcript } = run(["divorce", "Dana Whitlock", "Owen Whitlock", "Salt Lake County?"]);
    expect(transcript).not.toContain(NO_ADVICE_REPLY);
    expect(state.data.county).toBe("Salt Lake");
  });

  it("does not read a disclosure as a name", () => {
    const asName = run(["divorce", "My husband hits me"]).state;
    expect(asName.data.name).toBeUndefined();
    expect(asName.data.safetyConcern).toBe(true);
    const asOtherParty = run(["divorce", "Dana Whitlock", "He threatened to kill me"]).state;
    expect(asOtherParty.data.adverseName).toBeUndefined();
    expect(asOtherParty.answered).not.toContain("otherParty");
  });

  it("gives the crisis line for self-harm and does not push on with booking", () => {
    const { transcript, state } = run(["I am thinking about suicide"]);
    expect(transcript[0]).toBe(SELF_HARM_REPLY);
    expect(transcript.join(" ")).toContain("988");
    expect(transcript.join(" ")).not.toContain("To get you booked");
    expect(state.data.safetyConcern).toBe(true);
  });

  it("asks again when only a surname is given for the other side", () => {
    const { state } = run(["divorce", "Dana Whitlock", "Reyes"]);
    expect(state.data.adverseName).toBeUndefined();
  });

  it.each([
    ["Davis, California", "California", null],
    ["Washington", "Washington", null],
    ["West Virginia", "West Virginia", null],
    ["Richmond, Virginia", "Virginia", null],
    ["Washington County", "Utah", "Washington"],
    ["Salt Lake County, Utah", "Utah", "Salt Lake"],
    ["Utah County", "Utah", "Utah"],
    ["Davis", "Utah", "Davis"],
  ])("places %s", (message, expectedState, county) => {
    const { data } = run(["divorce", "Dana Whitlock", "Owen Whitlock", message]).state;
    expect(data.state).toBe(expectedState);
    expect(data.county ?? null).toBe(county);
  });

  it("offers slots at the same local time in summer and winter", () => {
    expect(offerSlots(new Date("2026-11-13T22:00:00Z"))[0]).toEqual({ iso: "2026-11-16T17:00:00.000Z", label: "Monday Nov 16, 10 am" });
    expect(offerSlots(new Date("2026-07-03T22:00:00Z"))[0]).toEqual({ iso: "2026-07-06T16:00:00.000Z", label: "Monday Jul 6, 10 am" });
  });
});
