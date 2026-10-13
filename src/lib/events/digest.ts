const DIGEST_HEADING = /(?:^|\n)\s*#?\s*(?:дайджест|digest|підбірка|подборка)(?=$|[\s:,.!])/im;
const DATE = /(?:^|\D)(\d{1,2}[./-]\d{1,2})(?=$|\D)/g;
const TELEGRAM_LINK = /(?:https?:\/\/)?t\.me\/[a-z0-9_+/\-]+/gi;

export function isClearlyEventDigest(text: string | null | undefined): boolean {
  if (!text) return false;

  if (DIGEST_HEADING.test(text.slice(0, 300))) return true;

  const dates = new Set([...text.matchAll(DATE)].map(match => match[1]));
  const links = new Set(text.match(TELEGRAM_LINK) ?? []);
  return dates.size >= 3 && links.size >= 3;
}
