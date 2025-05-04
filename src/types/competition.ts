export interface CompetitionEntry {
    team_id: number;
    bracket_id: string;
    tournament_id: number;
    stage: number;
    created_at?: Date;
}

export interface CompetitionResponse {
    success: boolean;
    entry?: CompetitionEntry;
    error?: string;
    message?: string;
} 