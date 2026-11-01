// Mentions are stored inside the comment text as @[Name](userId) (see ADR-0008 of the API). The
// text is shown as plain text with the mentions highlighted, never as HTML, so a comment cannot
// inject markup.
const MENTION =
  /@\[([^\]\n]{1,100})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export type Segment =
  { type: 'text'; text: string } | { type: 'mention'; name: string; userId: string };

export function splitMentions(body: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of body.matchAll(MENTION)) {
    const start = match.index;
    if (start > last) segments.push({ type: 'text', text: body.slice(last, start) });
    segments.push({ type: 'mention', name: match[1]!, userId: match[2]!.toLowerCase() });
    last = start + match[0].length;
  }
  if (last < body.length) segments.push({ type: 'text', text: body.slice(last) });
  return segments;
}

// The text to insert when someone picks a member to mention. Characters that would break the
// format are removed from the name.
export function mentionToken(name: string, userId: string): string {
  const safe =
    name
      .replace(/[\]\n]/g, '')
      .trim()
      .slice(0, 100) || 'member';
  return `@[${safe}](${userId})`;
}
