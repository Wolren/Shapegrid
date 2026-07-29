// ══════════════════════════════════════════════════════════════════════════════
// GitHub Language Fetcher — aggregate languages across all user repos
// ══════════════════════════════════════════════════════════════════════════════

import type { GitHubLanguage } from '../types';
import { updateState } from './state';
import { renderAllWidgets } from './dashboard';

// ── GraphQL query ────────────────────────────────────────────────────────────

const LANGUAGES_QUERY = `
query($login:String!) {
  user(login:$login) {
    repositories(first:50, ownerAffiliations:[OWNER], isFork:false) {
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
  token: string
): Promise<GitHubLanguage[]> {
  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: LANGUAGES_QUERY,
        variables: { login: username },
      }),
    });

    if (!response.ok) {
      console.warn(`GitHub API returned ${response.status} for language fetch`);
      return [];
    }

    const json = await response.json();

    if (json.errors?.length) {
      console.warn('GitHub GraphQL errors (languages):', json.errors[0].message);
      return [];
    }

    const repos = json.data?.user?.repositories?.nodes;
    if (!repos || repos.length === 0) {
      return [];
    }

    // ── Aggregate language bytes ──────────────────────────────────────────
    const langMap = new Map<string, { name: string; color: string; size: number }>();

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
          // Use the first color seen (or update if current is placeholder)
          if (existing.color === '#8b949e' && color !== '#8b949e') {
            existing.color = color;
          }
        } else {
          langMap.set(name, { name, color, size });
        }
      }
    }

    if (langMap.size === 0) return [];

    // ── Compute percentages ───────────────────────────────────────────────
    const totalBytes = Array.from(langMap.values()).reduce((sum, l) => sum + l.size, 0);
    if (totalBytes === 0) return [];

    const languages: GitHubLanguage[] = Array.from(langMap.values())
      .map(l => ({
        name: l.name,
        color: l.color,
        size: l.size,
        percentage: Math.round((l.size / totalBytes) * 10000) / 100, // 2 decimal places
      }))
      .sort((a, b) => b.percentage - a.percentage);

    return languages;
  } catch (err: any) {
    console.warn('Failed to fetch GitHub languages:', err.message);
    return [];
  }
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

  const languages = await fetchLanguages(user, token);
  updateState('languages', languages);
  renderAllWidgets();
}
