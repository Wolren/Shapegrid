// ══════════════════════════════════════════════════════════════════════════════
// GitHub Language Fetcher — aggregate languages across all user repos
// ══════════════════════════════════════════════════════════════════════════════

import type { GitHubLanguage } from '../types';
import { updateState, state } from './state';
import { renderAllWidgets } from './dashboard';

// ── GraphQL queries ──────────────────────────────────────────────────────────

const USER_LANGUAGES_QUERY = `
query($login:String!) {
  user(login:$login) {
    repositories(first:100, ownerAffiliations:[OWNER], isFork:false) {
      nodes {
        name
        languages(first:10) {
          edges {
            size
            node {
              name
              color
            }
          }
        }
      }
    }
  }
}
`;

const ORG_LANGUAGES_QUERY = `
query($login:String!) {
  organization(login:$login) {
    repositories(first:100, isFork:false) {
      nodes {
        name
        languages(first:10) {
          edges {
            size
            node {
              name
              color
            }
          }
        }
      }
    }
  }
}
`;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch language statistics for a GitHub user's repositories.
 *
 * Queries the GraphQL API, aggregates byte counts across all repos,
 * and returns a sorted array with percentage of total.
 */
export async function fetchLanguages(
  username: string,
  token: string,
  orgName?: string
): Promise<GitHubLanguage[]> {
  const aggregate = async (query: string, login: string): Promise<Map<string, { name: string; color: string; size: number }>> => {
    const langMap = new Map<string, { name: string; color: string; size: number }>();
    try {
      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { login },
        }),
      });

      if (!response.ok) {
        console.warn(`GitHub API returned ${response.status} for language fetch (${login})`);
        return langMap;
      }

      const json = await response.json();

      if (json.errors?.length) {
        console.warn('GitHub GraphQL errors (languages):', json.errors[0].message);
        return langMap;
      }

      const container = json.data?.user || json.data?.organization;
      const repos = container?.repositories?.nodes;
      if (!repos || repos.length === 0) return langMap;

      for (const repo of repos) {
        const edges = repo?.languages?.edges;
        if (!edges) continue;
        for (const edge of edges) {
          if (!edge?.node?.name) continue;
          const name = edge.node.name;
          const color = edge.node.color || '#8b949e';
          const size = edge.size || 0;
          const existing = langMap.get(name);
          if (existing) {
            existing.size += size;
            if (existing.color === '#8b949e' && color !== '#8b949e') {
              existing.color = color;
            }
          } else {
            langMap.set(name, { name, color, size });
          }
        }
      }
    } catch (err: any) {
      console.warn(`Failed to fetch languages for ${login}:`, err.message);
    }
    return langMap;
  };

  // Fetch user repos
  const userMap = await aggregate(USER_LANGUAGES_QUERY, username);

  // Fetch org repos if requested
  let orgMap = new Map<string, { name: string; color: string; size: number }>();
  if (orgName && orgName.trim()) {
    orgMap = await aggregate(ORG_LANGUAGES_QUERY, orgName.trim());
  }

  // Merge org into user map
  for (const [name, data] of orgMap) {
    const existing = userMap.get(name);
    if (existing) {
      existing.size += data.size;
      if (existing.color === '#8b949e' && data.color !== '#8b949e') {
        existing.color = data.color;
      }
    } else {
      userMap.set(name, { ...data });
    }
  }

  if (userMap.size === 0) return [];

  // Compute percentages
  const totalBytes = Array.from(userMap.values()).reduce((sum, l) => sum + l.size, 0);
  if (totalBytes === 0) return [];

  const languages: GitHubLanguage[] = Array.from(userMap.values())
    .map(l => ({
      name: l.name,
      color: l.color,
      size: l.size,
      percentage: Math.round((l.size / totalBytes) * 10000) / 100,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  return languages;
}

/**
 * Convenience wrapper: fetch languages for the current state user/token,
 * update state.languages, and re-render dashboard widgets.
 *
 * Call this after a successful loadData() / contributions fetch.
 */
export async function fetchAndUpdateLanguages(): Promise<void> {
  const user = (document.getElementById('inp-user') as HTMLInputElement)?.value?.trim();
  const token = (document.getElementById('inp-token') as HTMLInputElement)?.value?.trim();

  if (!user || !token) {
    // Silently skip if credentials aren't available
    return;
  }

  const orgName = state.includeOrgRepos ? state.orgName : undefined;
  const languages = await fetchLanguages(user, token, orgName);
  updateState('languages', languages);
  renderAllWidgets();
}
