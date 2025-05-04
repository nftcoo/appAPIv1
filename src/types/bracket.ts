export interface BracketData {
    id: number;
    bracket_id: number;
    tournament_id: number;
    stage: number;
    team_id: number;
}

export interface Game {
    id: number;
    game: {
        team_1: string;
        team_2: string;
        team_1_score: number | null;
        team_2_score: number | null;
        type: number;
        line?: number;
        total?: number;
        start: string;
    };
    bet_type: number;
}

export interface Tip {
    team_id: number;
    bracket_game_id: number;
    tip: string;
    result?: string;
    dd?: number;
    plusmin?: number;
} 