export interface SportSummary {
    sport: string;
    total: number;
    wins: number;
    losses: number;
    winRate: string;
}

export interface SummaryResponse {
    success: boolean;
    data: SportSummary[];
} 