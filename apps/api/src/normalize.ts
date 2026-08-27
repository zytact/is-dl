export function parsePostedTime(postedText: string): string | null {
  if (!postedText) return null;

  const now = new Date();
  const text = postedText.toLowerCase().trim();

  try {
    // LinkedIn shows anything from "1 minute ago" to "3 months ago".
    const match = text.match(/(\d+)\s+(second|minute|hour|day|week|month)s?\s+ago/);
    if (!match) return null;

    const amount = Number.parseInt(match[1] ?? '0', 10);
    const unit = match[2];

    const timestamp = new Date(now);

    switch (unit) {
      case 'second':
        timestamp.setSeconds(timestamp.getSeconds() - amount);
        break;
      case 'minute':
        timestamp.setMinutes(timestamp.getMinutes() - amount);
        break;
      case 'hour':
        timestamp.setHours(timestamp.getHours() - amount);
        break;
      case 'day':
        timestamp.setDate(timestamp.getDate() - amount);
        break;
      case 'week':
        timestamp.setDate(timestamp.getDate() - amount * 7);
        break;
      case 'month':
        timestamp.setMonth(timestamp.getMonth() - amount);
        break;
      default:
        return null;
    }

    return timestamp.toISOString();
  } catch {
    return null;
  }
}
