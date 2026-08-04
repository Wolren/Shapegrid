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

  const days = (cal.weeks ?? []).flatMap(w => w?.contributionDays ?? []);

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

export type ColorScale = 'github' | 'warm' | 'cool' | 'mono' | 'neon' | 'forest' | 'sunset' | 'ocean' | 'fire' | 'pastel' | 'arctic' | 'gold';

export interface PaletteDefinition {
  name: string;
  colors: string[];
}

export const BUILTIN_PALETTES: Record<string, PaletteDefinition> = {
  github: { name: 'GitHub', colors: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'] },
  warm:   { name: 'Warm',   colors: ['#1a0a00', '#7a2e00', '#c05000', '#e88030', '#ffe0b0'] },
  cool:   { name: 'Cool',   colors: ['#0a0a1a', '#0d3060', '#1560a8', '#40a0e0', '#b0e0ff'] },
  mono:   { name: 'Mono',   colors: ['#1a1a1a', '#3a3a3a', '#666666', '#a0a0a0', '#e0e0e0'] },
  neon:   { name: 'Neon',   colors: ['#050510', '#1a0040', '#4400cc', '#8800ff', '#cc44ff'] },
  forest: { name: 'Forest', colors: ['#0d1a0d', '#1a3d1a', '#2d6e2d', '#4caf50', '#a8e6a3'] },
  sunset: { name: 'Sunset', colors: ['#1a0010', '#6b0030', '#c0005a', '#ff4090', '#ffb0d0'] },
  ocean:  { name: 'Ocean',  colors: ['#000d1a', '#003060', '#0070b0', '#00aad0', '#80e8ff'] },
  fire:   { name: 'Fire',   colors: ['#1a0000', '#6b1000', '#c04000', '#ff8000', '#ffee00'] },
  pastel: { name: 'Pastel', colors: ['#1a1a2e', '#6a4c93', '#c9a0dc', '#f4c6e0', '#fff5f0'] },
  arctic: { name: 'Arctic', colors: ['#001020', '#003080', '#0080d0', '#60c8f0', '#e0f8ff'] },
  gold:   { name: 'Gold',   colors: ['#1a1200', '#5a3c00', '#b07000', '#e0a800', '#ffe060'] },
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}

/** Returns a CSS hex colour for intensity 0–1 */
export function intensityToColor(intensity: number, scale: ColorScale = 'github'): string {
  const t = Math.max(0, Math.min(1, intensity));
  
  // If palette is a built-in one, use interpolated colors
  const palette = BUILTIN_PALETTES[scale];
  if (palette) {
    const colors = palette.colors;
    if (t === 0) return colors[0];
    
    // Interpolate between color stops
    const segments = colors.length - 1;
    const segment = Math.min(Math.floor(t * segments), segments - 1);
    const localT = (t * segments) - segment;
    
    const c1 = hexToRgb(colors[segment]);
    const c2 = hexToRgb(colors[segment + 1]);
    
    if (c1 && c2) {
      const r = Math.round(c1.r + (c2.r - c1.r) * localT);
      const g = Math.round(c1.g + (c2.g - c1.g) * localT);
      const b = Math.round(c1.b + (c2.b - c1.b) * localT);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
  }

  // Fallback to legacy step-based rendering
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
      if (t === 0) return '#050510';
      if (t < 0.25) return '#1a0040';
      if (t < 0.5)  return '#4400cc';
      if (t < 0.75) return '#8800ff';
      return '#cc44ff';

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

export interface GitHubLanguage {
  name: string;
  color: string;
  percentage: number;
}

const LANGUAGES_QUERY = /* graphql */ `
query($login:String!) {
  user(login:$login) {
    repositories(first:100, ownerAffiliations:[OWNER], isFork:false) {
      nodes {
        name
        languages(first:10) {
          edges {
            size
            node { name color }
          }
        }
      }
    }
  }
}
`;

/**
 * Aggregate language byte counts across a user's repositories (GraphQL),
 * returning a sorted percentage breakdown. Mirrors the web viewer's fetch.
 */
export async function fetchLanguages(
  username: string,
  token: string
): Promise<GitHubLanguage[]> {
  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: LANGUAGES_QUERY, variables: { login: username } }),
    });
    if (!response.ok) return [];

    const json = await response.json() as {
      data?: { user?: { repositories?: { nodes?: {
        languages?: { edges?: { size: number; node: { name: string; color: string | null } }[] };
      }[] } } };
      errors?: { message: string }[];
    };
    if (json.errors?.length) return [];

    const repos = json.data?.user?.repositories?.nodes ?? [];
    const sizes = new Map<string, { size: number; color: string }>();
    let total = 0;
    for (const repo of repos) {
      for (const edge of repo?.languages?.edges ?? []) {
        const name = edge?.node?.name;
        if (!name) continue;
        const color = edge.node.color || '#8b949e';
        const size = edge.size || 0;
        const cur = sizes.get(name);
        if (cur) {
          cur.size += size;
          if (cur.color === '#8b949e' && color !== '#8b949e') cur.color = color;
        } else {
          sizes.set(name, { size, color });
        }
        total += size;
      }
    }
    if (total === 0) return [];

    return Array.from(sizes.entries())
      .map(([name, { size, color }]) => ({ name, color, percentage: (size / total) * 100 }))
      .sort((a, b) => b.percentage - a.percentage);
  } catch {
    return [];
  }
}
