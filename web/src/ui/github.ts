// ══════════════════════════════════════════════════════════════════════════════
// GitHub API integration
// ══════════════════════════════════════════════════════════════════════════════

import type { GitHubContributions, GitHubDay } from '../types';

async function fetchContributionsSingle(
  username: string,
  from: Date,
  to: Date,
  token: string
): Promise<GitHubContributions> {
  const q = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{totalContributions weeks{contributionDays{date contributionCount color weekday}}}}}}`;
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables: { login: username, from: from.toISOString(), to: to.toISOString() } }),
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  const j = await r.json();
  if (j.errors?.length) throw new Error(j.errors[0].message);
  const cal = j.data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal) throw new Error(`User "${username}" not found`);
  return {
    username,
    total: cal.totalContributions,
    days: cal.weeks.flatMap((w: any) => w.contributionDays) as GitHubDay[],
  };
}

export async function fetchContributions(
  username: string,
  from: Date,
  to: Date,
  token: string
): Promise<GitHubContributions> {
  const fromTime = from.getTime();
  const toTime = to.getTime();
  const chunkSizeMs = 360 * 24 * 60 * 60 * 1000; // 360 days

  if (toTime - fromTime <= chunkSizeMs) {
    return fetchContributionsSingle(username, from, to, token);
  }

  const chunks: { from: Date; to: Date }[] = [];
  let currentFrom = new Date(fromTime);

  while (currentFrom.getTime() < toTime) {
    const chunkTo = new Date(Math.min(currentFrom.getTime() + chunkSizeMs, toTime));
    chunks.push({ from: new Date(currentFrom), to: chunkTo });
    currentFrom = new Date(chunkTo.getTime() + 1);
  }

  const results = await Promise.all(
    chunks.map(({ from, to }) => fetchContributionsSingle(username, from, to, token))
  );

  const dayMap = new Map<string, GitHubDay>();
  let totalContributions = 0;

  for (const result of results) {
    totalContributions += result.total;
    for (const day of result.days) {
      dayMap.set(day.date, day);
    }
  }

  const days = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    username,
    total: totalContributions,
    days,
  };
}
