/**
 * github.ts
 * Fetches GitHub contribution data via the GraphQL API.
 * Works in Node (CLI/Action) and browser (GitHub Pages viewer).
 */

export interface ContributionDay {
  date: string;          // ISO "YYYY-MM-DD"
  contributionCount: number;
  color: string;         // GitHub's own hex colour, e.g. "#9be9a8"
  weekday: number;       // 0 = Sunday
}

export interface ContributionData {
  username: string;
  totalContributions: number;
  days: ContributionDay[];
}

// ─── GraphQL query ────────────────────────────────────────────────────────────

const QUERY = /* graphql */ `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            color
            weekday
          }
        }
      }
    }
  }
}
`;

// ─── Fetcher ──────────────────────────────────────────────────────────────────

/**
 * Fetch GitHub contributions, automatically splitting into yearly chunks
 * if the date range exceeds 365 days (GitHub API limitation).
 */
export async function fetchContributions(
  username: string,
  from: Date,
  to: Date,
  token: string
): Promise<ContributionData> {
  const fromTime = from.getTime();
  const toTime = to.getTime();
  // Use 360 days as chunk size to stay safely under GitHub's 1-year limit
  const chunkSizeMs = 360 * 24 * 60 * 60 * 1000;

  // If range is small enough, single request is fine
  if (toTime - fromTime <= chunkSizeMs) {
    return fetchContributionsSingle(username, from, to, token);
  }

  // Split into chunks
  const chunks: { from: Date; to: Date }[] = [];
  let currentFrom = new Date(fromTime);

  while (currentFrom.getTime() < toTime) {
    const chunkTo = new Date(Math.min(currentFrom.getTime() + chunkSizeMs, toTime));
    chunks.push({ from: new Date(currentFrom), to: chunkTo });
    currentFrom = new Date(chunkTo.getTime() + 1); // +1ms to avoid overlap
  }

  // Fetch all chunks in parallel
  const results = await Promise.all(
    chunks.map(({ from, to }) => fetchContributionsSingle(username, from, to, token))
  );

  // Merge results: deduplicate days by date
  const dayMap = new Map<string, ContributionDay>();
  let totalContributions = 0;

  for (const result of results) {
    totalContributions += result.totalContributions;
    for (const day of result.days) {
      dayMap.set(day.date, day);
    }
  }

  // Sort days by date
  const days = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    username,
    totalContributions,
    days,
  };
}

/**
 * Fetch contributions for a single date range (must be <= 1 year).
 */
async function fetchContributionsSingle(
  username: string,
  from: Date,
  to: Date,
  token: string
): Promise<ContributionData> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        login: username,
        from: from.toISOString(),
        to: to.toISOString(),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as {
    data?: { user?: { contributionsCollection?: { contributionCalendar?: {
      totalContributions: number;
      weeks: { contributionDays: ContributionDay[] }[];
    } } } };
    errors?: { message: string }[];
  };

  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${json.errors.map(e => e.message).join(', ')}`);
  }

  const cal = json.data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal) throw new Error(`User "${username}" not found or no contribution data`);

  const days = cal.weeks.flatMap(w => w.contributionDays);

  return {
    username,
    totalContributions: cal.totalContributions,
    days,
  };
}

// ─── Map contributions to cells ───────────────────────────────────────────────

export interface CellData {
  index: number;   // cell index in grid
  date: string;    // ISO date string
  count: number;   // contribution count
  /** 0–1 normalised intensity */
  intensity: number;
}

/**
 * Assign contribution day data to grid cells.
 * Cells are filled in reading order (same order as days, oldest first).
 */
export function mapContributionsToCells(
  contributions: ContributionData,
  cellCount: number,
  dateRange: { start: Date; end: Date }
): CellData[] {
  // Filter days to requested range
  const startStr = dateRange.start.toISOString().slice(0, 10);
  const endStr = dateRange.end.toISOString().slice(0, 10);

  const filtered = contributions.days.filter(
    d => d.date >= startStr && d.date <= endStr
  );

  // Normalise counts for height/intensity mapping
  const max = Math.max(1, ...filtered.map(d => d.contributionCount));

  const result: CellData[] = [];
  const total = Math.min(cellCount, filtered.length);

  for (let i = 0; i < total; i++) {
    const day = filtered[i];
    result.push({
      index: i,
      date: day.date,
      count: day.contributionCount,
      intensity: day.contributionCount / max,
    });
  }

  // Pad remaining cells with zero
  for (let i = result.length; i < cellCount; i++) {
    result.push({ index: i, date: '', count: 0, intensity: 0 });
  }

  return result;
}

// ─── Colour scales ────────────────────────────────────────────────────────────

export type ColorScale = 'github' | 'warm' | 'cool' | 'mono' | 'neon';

/** Returns a CSS hex colour for intensity 0–1 */
export function intensityToColor(intensity: number, scale: ColorScale = 'github'): string {
  const t = Math.max(0, Math.min(1, intensity));

  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  const hex = (r: number, g: number, b: number) =>
    `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

  switch (scale) {
    case 'github':
      if (t === 0) return '#161b22';
      if (t < 0.25) return '#0e4429';
      if (t < 0.5)  return '#006d32';
      if (t < 0.75) return '#26a641';
      return '#39d353';

    case 'warm':
      return hex(
        lerp(0x1a, 0xff),
        lerp(0x0a, 0x6a),
        lerp(0x0a, 0x00)
      );

    case 'cool':
      return hex(
        lerp(0x0a, 0x00),
        lerp(0x0a, 0x6a),
        lerp(0x1a, 0xff)
      );

    case 'mono':
      return hex(lerp(0x16, 0xff), lerp(0x16, 0xff), lerp(0x16, 0xff));

    case 'neon':
      if (t === 0) return '#0a0a0a';
      if (t < 0.5) return `#${Math.round(lerp(0, 255)).toString(16).padStart(2,'0')}00${Math.round(lerp(0,180)).toString(16).padStart(2,'0')}`;
      return `#ff${Math.round(lerp(0,80)).toString(16).padStart(2,'0')}${Math.round(lerp(180,255)).toString(16).padStart(2,'0')}`;

    default:
      return '#39d353';
  }
}

/** Generate legend stops for a colour scale */
export function legendStops(scale: ColorScale, steps = 5): { label: string; color: string }[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    return {
      label: i === 0 ? 'None' : i === steps - 1 ? 'Max' : '',
      color: intensityToColor(t, scale),
    };
  });
}
