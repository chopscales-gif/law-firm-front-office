import { describe, expect, it } from "vitest";
import { compareNames } from "./compare";
import { PROBABLE, STRONG, runConflictCheck, type PartyRecord } from "./check";
import { parsePerson, looksLikeOrganization } from "./normalize";
import { editDistance, jaroWinkler, soundex } from "./similarity";

const score = (a: string, b: string) => compareNames(a, b)?.score ?? 0;

describe("similarity primitives", () => {
  it("counts an adjacent swap as one edit", () => {
    expect(editDistance("abernathy", "abernahty")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
  it("jaro-winkler is 1 for equal strings and low for unrelated ones", () => {
    expect(jaroWinkler("thornton", "thornton")).toBe(1);
    expect(jaroWinkler("thornton", "alvarez")).toBeLessThan(0.6);
  });
  it("soundex groups names that sound alike", () => {
    expect(soundex("robert")).toBe("R163");
    expect(soundex("rupert")).toBe("R163");
    expect(soundex("tymczak")).toBe("T522");
  });
});

describe("name parsing", () => {
  it("reads surname-first names", () => {
    const p = parsePerson("Nguyen, Minh T.");
    expect([p.first, p.middles, p.last]).toEqual(["minh", ["t"], "nguyen"]);
  });
  it("does not mistake a suffix after a comma for a given name", () => {
    const p = parsePerson("DeShawn Carter, Sr.");
    expect([p.first, p.last]).toEqual(["deshawn", "carter"]);
  });
  it("drops titles and suffixes, strips accents and apostrophes", () => {
    const p = parsePerson("Dr. José O'Hernández III");
    expect([p.first, p.last]).toEqual(["jose", "ohernandez"]);
  });
  it("keeps surname particles with the surname", () => {
    expect(parsePerson("Maria de la Cruz").last).toBe("delacruz");
  });
  it("captures a quoted nickname", () => {
    const p = parsePerson('Margaret "Peggy" Lindqvist');
    expect([p.first, p.nick, p.last]).toEqual(["margaret", "peggy", "lindqvist"]);
  });
  it("tells businesses from people", () => {
    expect(looksLikeOrganization("Halvorsen Plumbing & Heating Inc.")).toBe(true);
    expect(looksLikeOrganization("Erik Halvorsen")).toBe(false);
  });
});

describe("people: names that should match", () => {
  const strong: [string, string][] = [
    ["William J. Thornton", "william thornton"],
    ["Bill Thornton", "William J. Thornton"],
    ["Liz Park", "Elizabeth Park"],
    ["Kate Reyes", "Katherine Reyes"],
    ["Steven McAllister", "Stephen MacAllister"],
    ["Jose Hernandez", "José Hernández"],
    ["Minh Nguyen", "Nguyen, Minh T."],
    ["DeShawn Carter", "DeShawn Carter Sr."],
    ["Peggy Lindqvist", 'Margaret "Peggy" Lindqvist'],
    ["Mr. Robert O'Brien", "Bob OBrien"],
    ["Nguyen Minh", "Minh Nguyen"],
  ];
  it.each(strong)("%s ~ %s is a strong match", (a, b) => {
    expect(score(a, b)).toBeGreaterThanOrEqual(STRONG);
  });

  const probable: [string, string][] = [
    ["Jon Abernathey", "Jonathan Abernathy"],
    ["Katherine Reyes", "Katherine O'Malley-Reyes"],
    ["Kate Reyes", "Katherine O'Malley-Reyes"],
    ["Jonathan Abernahty", "Jonathan Abernathy"],
    ["Sara Tymchak", "Sarah Tymczak"],
    ["Maria Garcia", "Maria Garcia Lopez"],
  ];
  it.each(probable)("%s ~ %s is at least a probable match", (a, b) => {
    expect(score(a, b)).toBeGreaterThanOrEqual(PROBABLE);
  });

  it("explains a nickname match in plain words", () => {
    const result = compareNames("Bill Thornton", "William J. Thornton");
    expect(result?.basis).toBe("nickname");
    expect(result?.reasons.join(" ")).toContain("forms of the same name");
  });

  it("treats a lone initial as weaker evidence than a full name", () => {
    const initial = score("W. Thornton", "William Thornton");
    expect(initial).toBeGreaterThanOrEqual(PROBABLE);
    expect(initial).toBeLessThan(STRONG);
  });
});

describe("people: names that should not match", () => {
  const different: [string, string][] = [
    ["John Smith", "Jane Doe"],
    ["Daniel Lee", "Daniel Lew"],
    ["Anna Kim", "Hannah Lim"],
    ["Robert Jensen", "Roberta Hansen"],
    ["Michael Brown", "Michelle Braun"],
  ];
  it.each(different)("%s vs %s is below the probable threshold", (a, b) => {
    expect(score(a, b)).toBeLessThan(PROBABLE);
  });

  it("lists a shared surname as weak, not as a match", () => {
    const result = compareNames("Angela Thornton", "William Thornton");
    expect(result?.basis).toBe("surname-only");
    expect(result!.score).toBeLessThan(PROBABLE);
  });

  it("marks down a match when middle names disagree", () => {
    expect(score("John Paul Smith", "John Robert Smith")).toBeLessThan(STRONG);
    expect(score("John P. Smith", "John Paul Smith")).toBeGreaterThanOrEqual(STRONG);
  });
});

describe("businesses", () => {
  it("ignores legal suffixes and punctuation", () => {
    expect(score("Wasatch Ridge Property Management, LLC", "Wasatch Ridge Property Management")).toBe(1);
    expect(score("Halvorsen Plumbing & Heating Inc.", "Halvorsen Plumbing and Heating")).toBe(1);
  });
  it("expands common abbreviations", () => {
    expect(score("Wasatch Ridge Prop Mgmt", "Wasatch Ridge Property Management LLC")).toBeGreaterThanOrEqual(STRONG);
  });
  it("matches a shorter trading name inside a longer registered name", () => {
    expect(score("Halvorsen Plumbing", "Halvorsen Plumbing & Heating Inc.")).toBeGreaterThanOrEqual(PROBABLE);
  });
  it("matches initials used as a trade name", () => {
    expect(compareNames("WRPM", "Wasatch Ridge Property Management LLC", { a: "organization" })?.basis).toBe("initials");
  });
  it("does not link businesses that only share a generic word", () => {
    expect(score("Wasatch Dental Group", "Wasatch Ridge Property Management LLC")).toBeLessThan(PROBABLE);
    expect(score("Summit Property Management", "Wasatch Ridge Property Management LLC")).toBeLessThan(PROBABLE);
  });
  it("notes a surname inside a business name as a weak link", () => {
    const result = compareNames("Erik Halvorsen", "Halvorsen Plumbing & Heating Inc.");
    expect(result?.basis).toBe("surname-in-business");
    expect(result!.score).toBeLessThan(PROBABLE);
  });
});

const party = (over: Partial<PartyRecord> & Pick<PartyRecord, "name" | "role">): PartyRecord => ({
  id: over.name,
  aliases: [],
  kind: "person",
  email: null,
  phone: null,
  matterId: "m1",
  matterName: "Sample matter",
  matterStatus: "open",
  ...over,
});

describe("conflict check outcomes", () => {
  const files: PartyRecord[] = [
    party({ name: "Katherine O'Malley-Reyes", aliases: ["Katherine Reyes"], role: "client", matterName: "O'Malley-Reyes estate plan", email: "k.reyes@example.test" }),
    party({ name: "William J. Thornton", role: "opposing", matterName: "Sandoval v. Thornton" }),
    party({ name: "Priya Raman", role: "client", matterName: "Raman guardianship", matterStatus: "closed" }),
    party({ name: "Halvorsen Plumbing & Heating Inc.", kind: "organization", role: "related", matterName: "Halvorsen family trust" }),
    party({ name: "Tobias Wren", role: "client", matterName: "Wren adoption", phone: "(801) 555-0142" }),
  ];

  it("flags a conflict when the other side is a current client, even under a nickname and former name", () => {
    const result = runConflictCheck(
      [{ name: "Marcus Bell", role: "prospect" }, { name: "Kate Reyes", role: "adverse" }],
      files,
    );
    expect(result.outcome).toBe("conflict");
    expect(result.hits[0].partyName).toBe("Katherine O'Malley-Reyes");
    expect(result.hits[0].viaAlias).toBe(true);
    expect(result.hits[0].level).toBe("conflict");
  });

  it("flags a conflict when the prospect is someone the firm is acting against", () => {
    const result = runConflictCheck([{ name: "Bill Thornton", role: "prospect" }], files);
    expect(result.outcome).toBe("conflict");
  });

  it("will not call a check clear when only a surname was given and it matches", () => {
    const result = runConflictCheck([{ name: "Dev Raman", role: "prospect" }, { name: "Reyes", role: "adverse" }], files);
    expect(result.outcome).toBe("review");
    expect(result.summary).toContain("Only part of a name");
    expect(result.summary).not.toContain("No matches");
  });

  it("asks for review, not a conflict, when the other side is a former client", () => {
    const result = runConflictCheck(
      [{ name: "Dev Raman", role: "prospect" }, { name: "Priya Raman", role: "adverse" }],
      files,
    );
    expect(result.outcome).toBe("review");
  });

  it("treats a returning client as information, not a conflict", () => {
    const result = runConflictCheck([{ name: "Toby Wren", role: "prospect", phone: "801-555-0142" }], files);
    expect(result.outcome).toBe("clear");
    expect(result.hits[0].level).toBe("info");
    expect(result.hits[0].basis).toBe("phone");
  });

  it("matches on email even when the name is entirely different", () => {
    const result = runConflictCheck(
      [{ name: "Marcus Bell", role: "prospect" }, { name: "K. Smith", role: "adverse", email: "K.Reyes@example.test" }],
      files,
    );
    expect(result.outcome).toBe("conflict");
    expect(result.hits[0].basis).toBe("email");
  });

  it("is clear when nobody matches, and says how many names were searched", () => {
    const result = runConflictCheck(
      [{ name: "Dana Whitlock", role: "prospect" }, { name: "Owen Whitlock", role: "related" }],
      files,
    );
    expect(result.outcome).toBe("clear");
    expect(result.hits).toHaveLength(0);
    expect(result.partiesSearched).toBe(files.length);
  });

  it("never lets a weak match decide the outcome", () => {
    const result = runConflictCheck([{ name: "Angela Thornton", role: "prospect" }], files);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].strength).toBe("weak");
    expect(result.outcome).toBe("clear");
  });

  it("ignores blank names", () => {
    expect(runConflictCheck([{ name: "  ", role: "adverse" }], files).hits).toHaveLength(0);
  });
});
