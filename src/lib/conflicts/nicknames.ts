/**
 * Given names that are commonly used interchangeably. Each row is one group;
 * any two names in a row are treated as the same person's given name.
 * This is deliberately a curated list, not a dictionary: a false "same name"
 * wastes an attorney's time, so only well-established forms are included.
 */
const GROUPS: string[][] = [
  ["william", "will", "bill", "billy", "willie", "liam"],
  ["robert", "rob", "bob", "bobby", "robbie", "bert"],
  ["richard", "rich", "rick", "ricky", "dick"],
  ["james", "jim", "jimmy", "jamie"],
  ["john", "jon", "johnny", "jack"],
  ["jonathan", "jon", "jonathon", "johnathan", "jonny"],
  ["joseph", "joe", "joey"],
  ["jose", "pepe"],
  ["michael", "mike", "mikey", "mick"],
  ["thomas", "tom", "tommy"],
  ["charles", "charlie", "chuck", "chas"],
  ["christopher", "chris", "kris", "topher"],
  ["daniel", "dan", "danny"],
  ["matthew", "matt", "mathew"],
  ["anthony", "tony"],
  ["andrew", "andy", "drew"],
  ["edward", "ed", "eddie", "ted", "ned"],
  ["theodore", "ted", "teddy", "theo"],
  ["steven", "stephen", "steve", "stevie"],
  ["kenneth", "ken", "kenny"],
  ["ronald", "ron", "ronnie"],
  ["donald", "don", "donnie"],
  ["timothy", "tim", "timmy"],
  ["gregory", "greg", "gregg"],
  ["jeffrey", "jeff", "geoffrey", "geoff"],
  ["benjamin", "ben", "benny", "benji"],
  ["samuel", "sam", "sammy"],
  ["alexander", "alex", "xander", "sandy"],
  ["nicholas", "nick", "nicky", "nicolas"],
  ["patrick", "pat", "paddy"],
  ["peter", "pete"],
  ["phillip", "philip", "phil"],
  ["raymond", "ray"],
  ["lawrence", "laurence", "larry"],
  ["gerald", "gerry", "jerry"],
  ["jerome", "jerry"],
  ["frederick", "fred", "freddie", "freddy"],
  ["francis", "frank", "frankie", "fran"],
  ["henry", "hank", "harry"],
  ["harold", "harry", "hal"],
  ["walter", "walt", "wally"],
  ["albert", "al", "bert"],
  ["alan", "allan", "allen", "al"],
  ["david", "dave", "davey"],
  ["douglas", "doug"],
  ["nathan", "nate"],
  ["nathaniel", "nate", "nat"],
  ["zachary", "zach", "zack", "zak"],
  ["joshua", "josh"],
  ["jacob", "jake"],
  ["vincent", "vince", "vinny"],
  ["leonard", "leo", "len", "lenny"],
  ["erik", "eric", "erick"],
  ["elizabeth", "liz", "lizzie", "beth", "betty", "eliza", "betsy", "libby", "elisabeth"],
  ["katherine", "catherine", "kathryn", "kate", "katie", "kathy", "cathy", "kat", "kay", "kit", "kitty"],
  ["margaret", "maggie", "meg", "peggy", "marge", "margie", "greta"],
  ["patricia", "pat", "patty", "trish", "tricia"],
  ["jennifer", "jen", "jenny", "jenn"],
  ["jessica", "jess", "jessie"],
  ["rebecca", "becky", "becca"],
  ["susan", "sue", "susie", "suzy", "suzanne"],
  ["deborah", "debra", "deb", "debbie"],
  ["barbara", "barb", "barbie"],
  ["dorothy", "dot", "dottie", "dolly"],
  ["victoria", "vicky", "vicki", "tori"],
  ["christine", "christina", "chris", "chrissy", "tina", "kristina", "kristine"],
  ["kimberly", "kim", "kimmy"],
  ["samantha", "sam", "sammy"],
  ["alexandra", "alex", "alexa", "lexi", "sandra", "sandy"],
  ["abigail", "abby", "gail"],
  ["amanda", "mandy"],
  ["cynthia", "cindy"],
  ["pamela", "pam"],
  ["sarah", "sara", "sally"],
  ["stephanie", "steph"],
  ["theresa", "teresa", "terry", "tess", "tessa"],
  ["virginia", "ginny", "ginger"],
  ["jacqueline", "jackie", "jacky"],
  ["madeline", "madeleine", "maddie", "maddy"],
  ["natalie", "nat", "nattie"],
  ["nicole", "nikki", "nicky"],
  ["veronica", "ronnie", "roni"],
  ["eleanor", "ellie", "nora", "nell"],
  ["josephine", "jo", "josie"],
  ["judith", "judy"],
  ["carolyn", "caroline", "carol", "carrie"],
  ["ann", "anne", "anna", "annie", "nan", "nancy"],
  ["mary", "marie", "maria", "molly", "polly"],
  ["melissa", "mel", "missy"],
  ["michelle", "shelly", "mickey"],
  ["gabriela", "gabriella", "gabby", "gaby"],
  ["guadalupe", "lupe", "lupita"],
  ["francisco", "paco", "pancho", "frank"],
  ["mohammed", "muhammad", "mohamed", "mohammad"],
];

const INDEX = new Map<string, Set<number>>();
GROUPS.forEach((group, i) => {
  for (const name of group) {
    if (!INDEX.has(name)) INDEX.set(name, new Set());
    INDEX.get(name)!.add(i);
  }
});

/** True when the two given names are well-known forms of each other (but not when they are identical). */
export function areNicknames(a: string, b: string): boolean {
  if (a === b) return false;
  const ga = INDEX.get(a);
  const gb = INDEX.get(b);
  if (!ga || !gb) return false;
  for (const g of ga) if (gb.has(g)) return true;
  return false;
}
