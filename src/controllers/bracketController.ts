import { Request, Response } from 'express';
import { TursoClient } from '../services/tursoClient';
//import { BracketData, Game, Tip } from '../types/bracket';

interface Game {
    id: number;
    bracket_id: number;
    game_id: number;
    bet_type: number;
    game: {
        id: number;
        type: number;
        team_1: string;
        team_2: string;
        total: string | null;
        line: string | null;
        start: string;
        team_1_score: number | null;
        team_2_score: number | null;
    }
}

interface Tip {
    bracket_game_id: number;
    team_id: number;
    tip: string;
    dd: number;
    plusmin: number;
    result: string | null;
    submitted_on: string;
}

interface BracketData {
    id: number;
    bracket_id: number;
    tournament_id: number;
    stage: number;
    team_id: number;
}

interface BracketTeam {
    team_id: number;
    score: number;
}

interface BracketTip {
    team_id: number;
    bracket_game_id: number;
    tip: string;
    result?: string;
    dd: number;
    plusmin: number;
}

interface GameDetails {
    id: number;
    type: number;
    league: number;
    team_1: string;
    team_2: string;
    total: string | null;
    line: string | null;
    start: string;
    winner: number;
    team_1_score: number;
    team_2_score: number;
    meta: string;
    homedrawaway: number;
    archived: number;
}

interface BracketGame {
    id: number;
    bracket_id: number;
    game_id: number;
    bet_type: number;
    game: GameDetails;
}

interface BracketDetails {
    bracket: {
        round: {
            start: string;
            end: string;
            cutoff: string;
        };
        teams: BracketTeam[];
        tips: BracketTip[];
        games: BracketGame[];
        tie_breakers: {
            team_id: number;
            tip: string;
        }[];
    };
}

interface TieBreaker {
    team_id: number;
    tip: string;
}

const SPORT_TYPES: { [key: number]: string } = {
    1: "Basketball",
    2: "American Football",
    3: "Soccer",
    4: "Tennis",
    5: "Aussie Rules",
    6: "Ice Hockey",
    7: "Rugby League",
    8: "Rugby Union",
    9: "",
    10: "",
    11: "Baseball",
    12: "",
    13: "",
    14: "Rugby League"
};

export class BracketController {
    private tursoClient: TursoClient;

    constructor() {
        this.tursoClient = new TursoClient();
    }

    async getCurrentBrackets(req: Request, res: Response) {
        try {
            const { wallet } = req.params;

            // First get the owned NFTs (team IDs) from the NFT API
            const collection = '0x03f5CeE0d698c24A42A396EC6BDAEe014057d4c8';
            const api_key = process.env.NEXT_PUBLIC_API;
            const baseURL = `https://eth-mainnet.g.alchemy.com/nft/v2/${api_key}/getNFTs/`;
            const fetchURL = `${baseURL}?owner=${wallet}&contractAddresses%5B%5D=${collection}`;
            
            const nftResponse = await fetch(fetchURL, { method: 'GET' });
            const nftData = await nftResponse.json();
            
            if (!nftData.ownedNfts) {
                return res.status(404).json({ error: 'No NFTs found' });
            }

            const teamIds = nftData.ownedNfts.map((nft: any) => parseInt(nft.id.tokenId, 16));

            // Then get the brackets for these teams
            const result = await this.tursoClient.executeQuery(
                `SELECT * 
                FROM team_brackets 
                WHERE team_id IN (${teamIds.join(',')})
                AND tournament_id = (
                    SELECT MAX(tournament_id) 
                    FROM team_brackets
                )`,
                []
            );

            res.json({ brackets: result.rows });
        } catch (error) {
            console.error('getCurrentBrackets error:', error);
            res.status(500).json({ error: 'Failed to fetch current brackets' });
        }
    }

    async getFinalRoundBrackets(req: Request, res: Response): Promise<void> {
        try {
            // Get latest round 5 bracket
            const result = await this.tursoClient.executeQuery(
                `SELECT tb.* 
                FROM team_brackets tb
                JOIN (
                    SELECT tournament_id 
                    FROM team_brackets 
                    WHERE stage = 5 
                    ORDER BY tournament_id DESC 
                    LIMIT 1
                ) latest ON tb.tournament_id = latest.tournament_id
                WHERE tb.stage = 5`,
                []
            );

            if (result.rows.length === 0) {
                res.status(404).json({ error: 'No finals bracket found' });
                return;
            }

            const tournamentId = result.rows[0].tournament_id;
            const bracketId = result.rows[0].bracket_id;
            const teamIds = result.rows.map(row => row.team_id);

            // Fetch bracket details from external API
            const bracketUrl = `https://game-api.nfteams.club/brackets/${bracketId}`;
            const bracketResponse = await fetch(bracketUrl);
            if (!bracketResponse.ok) {
                throw new Error(`Failed to fetch bracket: ${bracketResponse.statusText}`);
            }
            const bracketDetails: BracketDetails = await bracketResponse.json();

            console.log('bracketDetails:', JSON.stringify(bracketDetails, null, 2));
            
            if (!bracketDetails?.bracket?.tips) {
                throw new Error('Invalid bracket details structure');
            }

            // Get team names from S3
            const teamNames = new Map<number, string>();
            await Promise.all(
                teamIds.map(async (teamId) => {
                    try {
                        const response = await fetch(`https://s3.ap-southeast-2.amazonaws.com/nft-meta.nfteams.club/${teamId}`);
                        const data = await response.json();
                        teamNames.set(teamId, data.name);
                    } catch (error) {
                        console.error(`Error fetching name for team ${teamId}:`, error);
                        teamNames.set(teamId, `Team ${teamId}`);
                    }
                })
            );

            // Process each game first
            const gameDetails = bracketDetails.bracket.games.map((game: Game) => {
                const result = game.game.team_1_score !== null && game.game.team_2_score !== null
                    ? `${game.game.team_1_score} - ${game.game.team_2_score}`
                    : "Not Scored";

                return {
                    id: game.id,
                    matchup: `${game.game.team_1} vs ${game.game.team_2}`,
                    start: formatDate(game.game.start),
                    betType: game.bet_type,
                    line: game.game.line,
                    total: game.game.total,
                    result
                };
            });

            // Calculate scores and format tips by team
            console.log('Tips array:', bracketDetails.bracket.tips);
            
            const teamScores = teamIds.map(teamId => {
                console.log(`\nProcessing team ${teamId}:`);
                
                // Get all tips for this team from tips array
                const teamTips = bracketDetails.bracket.tips
                    .filter((tip: BracketTip) => {
                        console.log(`Comparing tip.team_id ${tip.team_id} with teamId ${teamId}`);
                        return String(tip.team_id) === String(teamId);
                    });
                
                console.log(`Found ${teamTips.length} tips`);
                
                // Calculate total score from the filtered tips
                const totalScore = teamTips.reduce((sum: number, tip: BracketTip) => {
                    const result = tip.result ? parseFloat(tip.result) : 0;
                    console.log(`  Tip result: ${result} (${tip.result})`);
                    return sum + result;
                }, 0);

                console.log(`Total score for team ${teamId}: ${totalScore}`);

                const name = teamNames.get(teamId) || `Team ${teamId}`;
                return { teamId, name, score: totalScore, tips: teamTips };
            });

            // Sort teams by score in descending order
            const sortedTeams = teamScores
                .sort((a, b) => b.score - a.score)
                .map(team => `${team.name}: ${team.score.toFixed(2)} points`);

            res.json({
                success: true,
                data: {
                    tournament_id: parseInt(tournamentId),
                    bracket_id: parseInt(bracketId),
                    games: gameDetails,
                    teams: sortedTeams
                }
            });

        } catch (error) {
            console.error('getFinalRoundBrackets error:', error);
            res.status(500).json({ error: 'Failed to fetch final round brackets' });
        }
    }

    async getLastRoundWinners(req: Request, res: Response) {
        try {
            const { wallet } = req.params;
            console.log(`[getLastRoundWinners] Processing request for wallet: ${wallet}`);

            // First get the owned NFTs (team IDs)
            const collection = '0x03f5CeE0d698c24A42A396EC6BDAEe014057d4c8';
            const api_key = process.env.NEXT_PUBLIC_API;
            const baseURL = `https://eth-mainnet.g.alchemy.com/nft/v2/${api_key}/getNFTs/`;
            const fetchURL = `${baseURL}?owner=${wallet}&contractAddresses%5B%5D=${collection}`;
            
            console.log(`[getLastRoundWinners] Fetching NFTs from: ${baseURL}`);
            const nftResponse = await fetch(fetchURL, { method: 'GET' });
            const nftData = await nftResponse.json();
            
            if (!nftData.ownedNfts) {
                console.log(`[getLastRoundWinners] No NFTs found for wallet: ${wallet}`);
                return res.status(404).json({ error: 'No NFTs found' });
            }

            const teamIds = nftData.ownedNfts.map((nft: any) => parseInt(nft.id.tokenId, 16));
            console.log(`[getLastRoundWinners] Found ${teamIds.length} team IDs: ${teamIds.join(', ')}`);

            // Get latest tournament and stage
            console.log(`[getLastRoundWinners] Querying latest tournament and stage for teams`);
            const result = await this.tursoClient.executeQuery(
                `WITH LatestTournament AS (
                    SELECT MAX(tournament_id) as max_tournament_id
                    FROM team_brackets
                    WHERE team_id IN (${teamIds.join(',')})
                ),
                LatestStage AS (
                    SELECT MAX(stage) as max_stage
                    FROM team_brackets
                    WHERE tournament_id = (SELECT max_tournament_id FROM LatestTournament)
                )
                SELECT id, bracket_id, tournament_id, stage, team_id 
                FROM team_brackets 
                WHERE team_id IN (${teamIds.join(',')})
                AND tournament_id = (SELECT max_tournament_id FROM LatestTournament)
                AND stage = (SELECT max_stage FROM LatestStage)
                ORDER BY bracket_id DESC`,
                []
            );

            if (result.rows.length === 0) {
                console.log(`[getLastRoundWinners] No brackets found for the latest round`);
                return res.status(404).json({ error: 'No brackets found for the latest round' });
            }

            console.log(`[getLastRoundWinners] Found ${result.rows.length} brackets for the latest round`);
            console.log(`[getLastRoundWinners] Tournament ID: ${result.rows[0].tournament_id}, Stage: ${result.rows[0].stage}`);

            // Track winners and losers
            const winners: number[] = [];
            let totalTeams = 0;

            // Check each bracket
            for (const row of result.rows) {
                const bracketData: BracketData = {
                    id: row.id,
                    bracket_id: row.bracket_id,
                    tournament_id: row.tournament_id,
                    stage: row.stage,
                    team_id: row.team_id
                };

                console.log(`[getLastRoundWinners] Processing bracket ID: ${bracketData.bracket_id} for team ID: ${bracketData.team_id}`);

                // Fetch bracket details from API
                const bracketUrl = `https://game-api.nfteams.club/brackets/${bracketData.bracket_id}`;
                console.log(`[getLastRoundWinners] Fetching bracket details from: ${bracketUrl}`);
                const response = await fetch(bracketUrl);
                const details = await response.json();

                // Only count completed brackets
                if (details.bracket.winner !== null) {
                    totalTeams++;
                    console.log(`[getLastRoundWinners] Bracket ${bracketData.bracket_id} is completed. Winner: ${details.bracket.winner}, Team ID: ${bracketData.team_id}`);
                    
                    // Convert both values to strings for comparison to ensure type consistency
                    const winnerId = String(details.bracket.winner);
                    const teamId = String(bracketData.team_id);
                    
                    console.log(`[getLastRoundWinners] Comparing winner ID (${winnerId}) with team ID (${teamId})`);
                    
                    if (winnerId === teamId) {
                        console.log(`[getLastRoundWinners] WINNER FOUND! Team ${bracketData.team_id} won bracket ${bracketData.bracket_id}`);
                        winners.push(bracketData.team_id);
                    } else {
                        console.log(`[getLastRoundWinners] Team ${bracketData.team_id} did not win bracket ${bracketData.bracket_id}`);
                    }
                } else {
                    console.log(`[getLastRoundWinners] Bracket ${bracketData.bracket_id} is not completed yet. Winner is null.`);
                }
            }

            console.log(`[getLastRoundWinners] Summary: ${winners.length} winners out of ${totalTeams} total teams`);
            console.log(`[getLastRoundWinners] Winners: ${winners.join(', ')}`);

            res.json({ 
                winners,
                totalTeams,
                losers: totalTeams - winners.length,
                lastStage: result.rows[0]?.stage || null
            });
        } catch (error) {
            console.error('getLastRoundWinners error:', error);
            res.status(500).json({ error: 'Failed to fetch last round winners' });
        }
    }

    async getTeamBrackets(req: Request, res: Response) {
        try {
            const { teamIds } = req.body;

            if (!teamIds || !Array.isArray(teamIds) || teamIds.length === 0) {
                return res.status(400).json({ error: 'Valid team IDs array is required' });
            }

            const url = process.env.NEXT_PUBLIC_URL_FOUR;
            const authToken = process.env.NEXT_PUBLIC_TOKEN_FOUR;

            if (!url?.startsWith('https://')) {
                throw new Error('Invalid URL format. URL must start with https://');
            }

            // Query team_brackets table for latest brackets
            const querybracket = `
                WITH LatestTournament AS (
                    SELECT MAX(tournament_id) as max_tournament_id
                    FROM team_brackets
                    WHERE team_id IN (${teamIds.map(() => '?').join(',')})
                ),
                LatestStage AS (
                    SELECT MAX(stage) as max_stage
                    FROM team_brackets
                    WHERE tournament_id = (SELECT max_tournament_id FROM LatestTournament)
                )
                SELECT id, bracket_id, tournament_id, stage, team_id 
                FROM team_brackets 
                WHERE team_id IN (${teamIds.map(() => '?').join(',')})
                AND tournament_id = (SELECT max_tournament_id FROM LatestTournament)
                AND stage = (SELECT max_stage FROM LatestStage)
                ORDER BY bracket_id DESC
            `;

            const responsebracket = await fetch(`${url}/v2/pipeline`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    requests: [
                        {
                            type: "execute",
                            stmt: {
                                sql: querybracket,
                                args: [...teamIds, ...teamIds].map(id => ({
                                    type: "integer",
                                    value: id.toString()
                                }))
                            }
                        },
                        { type: "close" }
                    ]
                })
            });

            const databracket = await responsebracket.json();
            const rowsbracket = databracket.results[0].response.result.rows;

            if (rowsbracket.length === 0) {
                return res.status(404).json({ error: `No brackets found for teams ${teamIds.join(', ')}` });
            }

            // Process each team's bracket data
            const allTeamsData = await Promise.all(rowsbracket.map(async (row: any) => {
                const bracketData: BracketData = {
                    id: row[0].value,
                    bracket_id: row[1].value,
                    tournament_id: row[2].value,
                    stage: row[3].value,
                    team_id: Number(row[4].value)
                };

                // Fetch bracket details from API
                const bracketUrl = `https://game-api.nfteams.club/brackets/${bracketData.bracket_id}`;
                const bracketResponse = await fetch(bracketUrl);
                const bracketDetails = await bracketResponse.json();

                // Count scored games
                const totalGames = bracketDetails.bracket.games.length;
                const scoredGames = bracketDetails.bracket.games.filter(
                    (game: any) => game.game.team_1_score !== null && game.game.team_2_score !== null
                ).length;

                // Format games list
                const gamesList = bracketDetails.bracket.games.map((game: Game) => {
                    const sport = SPORT_TYPES[game.game.type] || `Sport Type ${game.game.type}`;
                    const matchup = `${game.game.team_1} vs ${game.game.team_2}`;
                    let betInfo = "";

                    switch (game.bet_type) {
                        case 1:
                            betInfo = game.game.line ? `Line: ${game.game.line}` : "Line: N/A";
                            break;
                        case 2:
                            betInfo = game.game.total ? `Total: ${game.game.total}` : "Total: N/A";
                            break;
                        case 3:
                            betInfo = "1X2";
                            break;
                    }

                    return {
                        sport,
                        matchup,
                        betInfo,
                        team1Score: game.game.team_1_score,
                        team2Score: game.game.team_2_score
                    };
                });

                // Calculate scores for all teams in the bracket
                const teamIds = Array.from(new Set<number>(bracketDetails.bracket.tips.map((tip: Tip) => tip.team_id)));
                const teamScores = teamIds.map(id => {
                    const teamTips = bracketDetails.bracket.tips.filter(
                        (tip: Tip) => tip.team_id === id
                    );

                    const totalScore = teamTips.reduce((sum: number, tip: Tip) => {
                        return sum + parseFloat(tip.result || "0");
                    }, 0);

                    return { teamId: id, totalScore };
                });

                // Sort by score descending
                teamScores.sort((a, b) => b.totalScore - a.totalScore);

                // Find this team's score
                const teamScore = teamScores.find(score => score.teamId === bracketData.team_id);

                return {
                    teamId: bracketData.team_id,
                    currentScore: teamScore ? teamScore.totalScore : 0,
                    gamesScored: scoredGames,
                    totalGames,
                    games: gamesList,
                    allTeamScores: teamScores.map(score => ({
                        teamId: score.teamId,
                        score: score.totalScore
                    }))
                };
            }));

            res.json({
                success: true,
                data: allTeamsData
            });

        } catch (error) {
            console.error('getTeamBrackets error:', error);
            res.status(500).json({ error: 'Failed to fetch team brackets' });
        }
    }

    async getLatestFinalsBracket(req: Request, res: Response) {
        try {
            // Query to get the latest round 5 bracket
            const result = await this.tursoClient.executeQuery(
                `SELECT tb.bracket_id, tb.tournament_id 
                FROM team_brackets tb
                JOIN (
                    SELECT tournament_id 
                    FROM team_brackets 
                    WHERE stage = 5 
                    ORDER BY tournament_id DESC 
                    LIMIT 1
                ) latest ON tb.tournament_id = latest.tournament_id
                WHERE tb.stage = 5
                LIMIT 1`,
                []
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No finals bracket found' });
            }

            res.json({
                tournament_id: result.rows[0].tournament_id,
                bracket_id: result.rows[0].bracket_id
            });
        } catch (error) {
            console.error('getLatestFinalsBracket error:', error);
            res.status(500).json({ error: 'Failed to fetch latest finals bracket' });
        }
    }
}

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        hour12: false
    }) + ' UTC';
} 