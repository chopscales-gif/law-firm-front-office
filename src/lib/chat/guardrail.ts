/**
 * Deterministic checks that run on every visitor message before anything else,
 * in scripted mode and in live-model mode alike. The assistant collects facts
 * and books a consultation; it never tells anyone what the law is or what to do.
 */

const ADVICE_PATTERNS: RegExp[] = [
  /\bshould (i|we|he|she|they)\b/,
  /\bwhat (should|can|do) (i|we) do\b/,
  /\bwhat are my (rights|options|chances|odds)\b/,
  /\bwhat('?s| is| are) (the|my) (law|laws|rights|penalt)/,
  /\b(do|will|would|can|could) (i|we) (have to|need to|win|lose|get|keep|sue|qualify|be (liable|charged|arrested|forced|able to))\b/,
  /\b(can|could|will|is) (he|she|they|my (ex|husband|wife|spouse|partner|landlord|boss|brother|sister|mother|father|parents?|kids?|children))\b.*\b(take|keep|sue|evict|force|make me|get|allowed|move|sell|stop)\b/,
  /\bis (it|that|this) (legal|illegal|lawful|against the law|allowed)\b/,
  /\bam i (allowed|entitled|liable|responsible|required|obligated|going to)\b/,
  /\bhow much (child support|alimony|custody|time|money) (will|can|should|would|do) (i|he|she|they|we)\b/,
  /\bhow (long|much) (will|does|would) (it|this|a divorce|the divorce|custody|probate)\b.*\b(take|cost me)\b/,
  /\bwho (gets|will get|keeps)\b/,
  /\b(legal|your) (advice|opinion)\b/,
  /\bdo i have a (case|claim)\b/,
  /\bis my (will|trust|prenup|agreement|contract) (valid|enforceable|legal)\b/,
  /\bwhat happens if\b/,
  /\b(tell me|know) (if|whether) (i|we|he|she|they|my)\b/,
  /\b(grounds for|against the law|statute of limitations)\b/,
];

const SAFETY_PATTERN = /\b(abus\w*|hit(s|ting)? me|hurt(s|ing)? me|threaten\w*|afraid for my|in danger|unsafe|violen\w*|stalk\w*|kill\w*)\b/;
const SELF_HARM_PATTERN = /\b(suicid\w*|kill(ing)? myself|end(ing)? my (own )?life|hurt(ing)? myself|harm(ing)? myself|don'?t want to (live|be alive))\b/;

/** Questions about the firm itself (booking, fees, hours) are logistics, not legal advice. */
const LOGISTICS_PATTERN = /\b(consult\w*|appointment|confirmation|call (me )?back|reschedul\w*|your (fees?|rates?|hours|office|address))\b/;

/** Words that mean a question is about the visitor's legal situation, whatever else it mentions. */
const LEGAL_TOPIC_PATTERN = /\b(divorc\w*|custody|alimony|child support|kids?|children|house|home|property|assets?|estate|inherit\w*|sue|legal|law|rights|court|judge)\b/;

const QUESTION_PATTERN = /\?|^(is|are|am|can|could|do|does|did|will|would|should|what|who|how|why|when|where)\b/;

/** A question put to the assistant or the firm ("can you call me?") rather than about the law. */
const ABOUT_THE_FIRM_PATTERN = /\b(you|your|the firm|someone|anyone|an attorney|a lawyer)\b/;

export function asksForLegalAdvice(message: string): boolean {
  const text = message.toLowerCase().replace(/[’`]/g, "'");
  if (LOGISTICS_PATTERN.test(text) && !LEGAL_TOPIC_PATTERN.test(text)) return false;
  return ADVICE_PATTERNS.some((p) => p.test(text));
}

/**
 * Any other question about the visitor's situation. The patterns above catch the
 * common phrasings; this catches the rest ("is adultery grounds for divorce?"),
 * because a question the assistant cannot place is safer refused than answered.
 */
export function isUnplacedQuestion(message: string): boolean {
  const text = message.toLowerCase().trim().replace(/[’`]/g, "'");
  if (!QUESTION_PATTERN.test(text)) return false;
  if (LOGISTICS_PATTERN.test(text) && !LEGAL_TOPIC_PATTERN.test(text)) return false;
  return LEGAL_TOPIC_PATTERN.test(text) || !ABOUT_THE_FIRM_PATTERN.test(text);
}

export function mentionsSafetyRisk(message: string): boolean {
  const text = message.toLowerCase().replace(/[’`]/g, "'");
  return SAFETY_PATTERN.test(text) || SELF_HARM_PATTERN.test(text);
}

export function mentionsSelfHarm(message: string): boolean {
  return SELF_HARM_PATTERN.test(message.toLowerCase().replace(/[’`]/g, "'"));
}

export const NO_ADVICE_REPLY =
  "I can't answer that. I'm an intake assistant, not a lawyer, and I can't give legal advice or tell you how the law applies to your situation. An attorney can go through it with you at a consultation, which is what I'm here to set up.";

export const SAFETY_REPLY =
  "If you or anyone else is in immediate danger, please call 911. I'll flag this conversation so the firm sees it first.";

export const SELF_HARM_REPLY =
  "I'm sorry you are going through this. If you are thinking about harming yourself, you can call or text 988, the Suicide and Crisis Lifeline, at any time. If you are in immediate danger, please call 911. I'll flag this conversation so the firm sees it first.";

export const CHAT_DISCLAIMER =
  "This assistant collects information for the firm. It does not give legal advice, and chatting here does not make you a client of the firm.";
