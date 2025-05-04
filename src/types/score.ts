export interface Score {
    team_id: number;
    bracket_id: string;
    tournament_id: number;
    stage: number;
    score: number;
}

export interface LeaderboardEntry {
    team_id: number;
    rank: number;
    total_points: number;
}

export interface HistoricalQueryParams {
    wallet?: string;
    teamId?: number;
    month?: string;
    year?: string;
    round?: number;
    sport?: string;
    league?: string;
    limit?: number;
} 