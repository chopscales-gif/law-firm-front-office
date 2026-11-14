/**
 * One-click conversations for the demo. Each is a list of visitor messages that
 * is played through the same chat a real visitor uses, so nothing is faked.
 */

export type Scenario = { key: string; title: string; blurb: string; messages: string[] };

export const SCENARIOS: Scenario[] = [
  {
    key: "clean",
    title: "A straightforward inquiry",
    blurb: "An estate plan, with no one on file. Ends with a booked consultation.",
    messages: [
      "My husband and I need wills and a trust for our house",
      "Dana Whitlock",
      "Owen Whitlock",
      "Salt Lake County",
      "Just planning ahead",
      "No, just the home",
      "dana.whitlock@mail.example or 801-555-0142",
      "A friend or family member",
      "The first one",
    ],
  },
  {
    key: "conflict",
    title: "A conflict of interest",
    blurb: "The other side turns out to be a current client, under a different name.",
    messages: [
      "I want to file for divorce",
      "Marcus Bell",
      "My wife, Kate Reyes",
      "Salt Lake County",
      "Within a month or two",
      "Both",
      "marcus.bell@mail.example, 801-555-0143",
      "Online search",
      "The second one",
    ],
  },
  {
    key: "advice",
    title: "Someone asks for legal advice",
    blurb: "The assistant declines, twice, and still finishes the intake.",
    messages: [
      "Can my ex take the kids out of state? What should I do?",
      "Priya Raman",
      "The other parent is Tomas Raman",
      "Bountiful",
      "How much child support am I entitled to?",
      "He says he is moving next month",
      "No, just the children",
      "priya.raman@mail.example",
      "Online search",
      "Call me instead",
    ],
  },
];
