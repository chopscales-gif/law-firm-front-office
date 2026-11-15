/**
 * The clients in "Play the story". Each run of the story uses the next one
 * who has not written in yet, so it can be played several times in one
 * sandbox. They are all invented, and each is an estate matter with nobody on
 * the other side, so the conflict check in the story always comes back clear.
 */

export type StoryClient = { name: string; messages: string[] };

const client = (name: string, opening: string, spouse: string, county: string, contact: string): StoryClient => ({
  name,
  messages: [opening, name, spouse, county, "Just planning ahead", "No, just the home", contact, "A friend or family member", "The first one"],
});

export const STORY_CAST: StoryClient[] = [
  client("Harriet Vandermolen", "My husband and I need wills and a trust for our house", "Tobias Vandermolen", "Salt Lake County", "harriet.vandermolen@mail.example or 801-555-0151"),
  client("Calvin Ostrowski", "My wife and I want to set up a living trust for our home", "June Ostrowski", "Davis County", "calvin.ostrowski@mail.example or 801-555-0152"),
  client("Beatrix Fonseca", "My husband and I need wills and a trust for our house", "Anselm Fonseca", "Summit County", "beatrix.fonseca@mail.example or 435-555-0153"),
  client("Leopold Nakagawa", "My wife and I want to set up a living trust for our home", "Mirei Nakagawa", "Utah County", "leopold.nakagawa@mail.example or 385-555-0154"),
  client("Odessa Pruitt", "My husband and I need wills and a trust for our house", "Wendell Pruitt", "Salt Lake County", "odessa.pruitt@mail.example or 801-555-0155"),
  client("Silas Everhart", "My wife and I want to set up a living trust for our home", "Noreen Everhart", "Davis County", "silas.everhart@mail.example or 801-555-0156"),
];

/** The next client who is not already among the sandbox's inquiries, or null when all have been used. */
export function nextStoryClient(namesOnFile: readonly string[]): StoryClient | null {
  const used = new Set(namesOnFile.map((name) => name.toLowerCase()));
  return STORY_CAST.find((c) => !used.has(c.name.toLowerCase())) ?? null;
}
