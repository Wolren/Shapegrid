/**
 * github.ts
 * Fetches GitHub contribution data via the GraphQL API.
 * Works in Node (CLI/Action) and browser (GitHub Pages viewer).
 */
export interface ContributionDay {
    date: string;
    contributionCount: number;
    color: string;
    weekday: number;
}
export interface ContributionData {
    username: string;
    totalContributions: number;
    days: ContributionDay[];
}
/**
 * Fetch GitHub contributions, automatically splitting into yearly chunks
 * if the date range exceeds 365 days (GitHub API limitation).
 */
export declare function fetchContributions(username: string, from: Date, to: Date, token: string): Promise<ContributionData>;
export interface CellData {
    index: number;
    date: string;
    count: number;
    /** 0–1 normalised intensity */
    intensity: number;
}
/**
 * Assign contribution day data to grid cells.
 * Cells are filled in reading order (same order as days, oldest first).
 */
export declare function mapContributionsToCells(contributions: ContributionData, cellCount: number, dateRange: {
    start: Date;
    end: Date;
}): CellData[];
export type ColorScale = 'github' | 'warm' | 'cool' | 'mono' | 'neon' | 'forest' | 'sunset' | 'ocean' | 'fire' | 'pastel' | 'arctic' | 'gold';
export interface PaletteDefinition {
    name: string;
    colors: string[];
}
export declare const BUILTIN_PALETTES: Record<string, PaletteDefinition>;
/** Returns a CSS hex colour for intensity 0–1 */
export declare function intensityToColor(intensity: number, scale?: ColorScale): string;
/** Generate legend stops for a colour scale */
export declare function legendStops(scale: ColorScale, steps?: number): {
    label: string;
    color: string;
}[];
//# sourceMappingURL=github.d.ts.map