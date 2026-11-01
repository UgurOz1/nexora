// A mention is written into the comment text as @[Display Name](user-id). The editor on the web
// inserts it when someone picks a person from the list, so the id is what counts: it still points
// at the right person if they later change their name.
const MENTION =
  /@\[[^\]\n]{1,100}\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

// The distinct user ids mentioned in a text, in order of first appearance.
export function parseMentions(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION)) {
    ids.add(match[1].toLowerCase());
  }
  return [...ids];
}

// Whom a save should notify: mentioned members who were not already mentioned before and who are
// not the author (nobody needs a notification for mentioning themselves).
export function newlyMentioned(options: {
  mentioned: string[];
  alreadyMentioned: string[];
  authorId: string;
}): string[] {
  const before = new Set(options.alreadyMentioned);
  return options.mentioned.filter((id) => id !== options.authorId && !before.has(id));
}
