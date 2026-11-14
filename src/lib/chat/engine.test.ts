import { describe, expect, it } from "vitest";
import { classifyMatter, completedIntake, extractName, listen, offerSlots, respond, startChat, type ChatState } from "./engine";
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
      phone: "(801) 555-0188",
      source: "referral",
      consultAt: slots[1].iso,
      safetyConcern: false,
    });
  });

  it("does not ask again for what the visitor already said", () => {
    const opening = respond(startChat(slots).state, "My husband and I need wills and a trust for our house");
    expect(opening.state.heard).toMatchObject({ relation: "husband", realEstate: true });
    const named = respond(opening.state, "Dana Whitlock");
    expect(named.replies.at(-1)).toContain("You mentioned your husband. What's his full name?");
    let turn = named;
    for (const message of ["Owen Whitlock", "Salt Lake County", "Just planning ahead"]) turn = respond(turn.state, message);
    const { state } = turn;
    expect(state.data.relatedNames).toEqual(["Owen Whitlock"]);
    expect(turn.replies.at(-1)).toBe("You mentioned a home. Is a business involved as well?");
    expect(turn.suggestions).toEqual(["Yes, a business too", "No, just the home"]);
    expect(respond(state, "No, just the home").state.data.signals).toEqual({ realEstate: true });
    expect(respond(state, "no").state.data.signals).toEqual({ realEstate: true });
    expect(respond(state, "Yes").state.data.signals).toEqual({ realEstate: true, business: true });
  });

  it("skips the details question when both parts have come up", () => {
    const { state, transcript } = run(["I need a divorce. We have two kids and a house", "Marcus Bell", "Kate Reyes", "Salt Lake County", "Within a month or two"]);
    expect(state.data.signals).toEqual({ children: true, realEstate: true });
    expect(transcript.at(-1)).toContain("best email or phone");
  });

  it("does not take a denial or a surname as a mention", () => {
    expect(listen("We need a will. We don't have kids, but we own a cabin")).toEqual({ realEstate: true });
    const { state } = run(["A will or trust", "Jim House"]);
    expect(state.heard?.realEstate).toBeUndefined();
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

  it("says what the firm handles when it cannot place the matter", () => {
    expect(respond(startChat(slots).state, "I got a speeding ticket in Provo").state.status).toBe("outside");
    const turn = respond(startChat(slots).state, "it's complicated");
    expect(turn.replies[0]).toContain("wills, trusts and probate");
    expect(turn.state.status).toBe("collecting");
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

  it("never offers a consultation time that is already booked", () => {
    const now = new Date("2026-11-13T22:00:00Z");
    const [first, second, third] = offerSlots(now);
    const next = offerSlots(now, [first.iso, second.iso]);
    expect(next.map((slot) => slot.label)).toEqual(["Monday Nov 16, 2:30 pm", "Tuesday Nov 17, 11 am", "Wednesday Nov 18, 11 am"]);
    expect(next.map((slot) => slot.iso)).not.toContain(first.iso);
    expect(next[2]).toEqual(third);
  });
});

describe("answers given before they are asked for", () => {
  it("keeps a name, a county, urgency and a referral from the opening message", () => {
    const first = respond(startChat(slots).state, "My name is Carl Jung, I live in Park City, and I need a trust for my cabin and my company. No rush. A friend referred me. carl@mail.example");
    expect(first.state.data).toMatchObject({ name: "Carl Jung", state: "Utah", county: "Summit", urgency: "planning", source: "referral", email: "carl@mail.example" });
    expect(first.replies).toContain("I've noted that you live in Summit County, that there's no rush and that you were referred.");
    // The only things left to ask are who else is involved and when to meet.
    expect(first.replies.at(-1)).toMatch(/^Thanks, Carl\. Is anyone else part of this/);
    const second = respond(first.state, "no one else");
    expect(second.replies.at(-1)).toMatch(/^Last step/);
  });

  it("keeps the other person's name when it comes with the matter", () => {
    const { state, transcript } = run(["I want to divorce my husband John Smith. We have two kids and a house in Sandy.", "Mary Smith"]);
    expect(state.data).toMatchObject({ name: "Mary Smith", adverseName: "John Smith" });
    expect(transcript.join(" ")).not.toContain("What's his full name");
    // "A house in Sandy" is where the house is, not necessarily where she lives.
    expect(transcript.at(-1)).toMatch(/^Where do you live/);
  });

  it("does not ask how soon after being told about a hearing", () => {
    const { state, transcript } = run(["I was served with divorce papers last week and there is a hearing in two weeks", "Gideon Marsh", "Elena Marsh", "Draper"]);
    expect(state.data.urgency).toBe("deadline");
    expect(transcript.join(" ")).not.toContain("How soon");
  });

  it("splits a name from whatever was typed with it", () => {
    expect(run(["a will", "Dana Whitlock, Salt Lake County"]).state.data).toMatchObject({ name: "Dana Whitlock", county: "Salt Lake" });
    expect(run(["a will", "Dana Whitlock, dana@mail.example"]).state.data).toMatchObject({ name: "Dana Whitlock", email: "dana@mail.example" });
    expect(run(["a will", "Mary Smith, I live in Sandy"]).state.data).toMatchObject({ name: "Mary Smith", county: "Salt Lake" });
  });

  it.each(["Outside Utah", "Just planning ahead", "no one else", "There's a hearing", "Salt Lake County", "Online search", "Both"])(
    "does not take %s for a person's name",
    (message) => {
      expect(run(["a will", message]).state.data.name).toBeUndefined();
      expect(run(["divorce", "Dana Whitlock", message]).state.data.adverseName ?? null).toBeNull();
    },
  );

  it("does not take the visitor's own name as the other party", () => {
    expect(run(["a will", "Dana Whitlock", "Dana Whitlock"]).state.answered).not.toContain("otherParty");
  });

  it("reads 'no court date' as no deadline", () => {
    expect(run(["a will", "Dana Whitlock", "just me", "Sandy", "There's no court date"]).state.data.urgency).toBe("planning");
  });

  it("books a time named by its day or its hour", () => {
    const upTo = ["a will", "Dana Whitlock", "just me", "Sandy", "no rush", "neither", "dana@mail.example", "google"];
    expect(run([...upTo, "Monday"]).state.data.consultAt).toBe(slots[0].iso);
    expect(run([...upTo, "Tuesday at 2:30"]).state.data.consultAt).toBe(slots[1].iso);
    expect(run([...upTo, "11 am works"]).state.data.consultAt).toBe(slots[2].iso);
  });

  it("explains the choice of times instead of refusing legal advice when asked for another day", () => {
    const { state, transcript } = run(["a will", "Dana Whitlock", "just me", "Sandy", "no rush", "neither", "dana@mail.example", "google", "Can I do Friday?"]);
    expect(state.status).toBe("collecting");
    expect(transcript.at(-1)).toContain("Call me instead");
    expect(transcript.at(-1)).not.toBe(NO_ADVICE_REPLY);
  });

  it("tells someone outside Utah where the firm is licensed, once", () => {
    const { transcript } = run(["custody", "Priya Raman", "Tomas Raman", "Idaho", "soon"]);
    expect(transcript.filter((line) => line.includes("licensed only in Utah"))).toHaveLength(1);
  });

  it("greets back instead of apologising", () => {
    expect(run(["hello"]).transcript[0]).toMatch(/^Hello\. What kind of matter/);
  });
});
