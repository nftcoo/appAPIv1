import { Request, Response } from 'express';
import { TursoClient } from '../services/tursoClient';

export class ScoreController {
    private tursoClient: TursoClient;

    constructor() {
        this.tursoClient = new TursoClient();
    }

    async getCurrentScores(req: Request, res: Response) {
        try {
            const { wallet } = req.params;

            // Get owned NFTs first
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
            console.log('Team IDs:', teamIds);

            // Get only the latest stage brackets for each team
            const result = await this.tursoClient.executeQuery(
                `WITH CurrentTournament AS (
                    SELECT tournament_id 
                    FROM team_brackets 
                    ORDER BY tournament_id DESC 
                    LIMIT 1
                ),
                MaxStage AS (
                    SELECT MAX(stage) as stage
                    FROM team_brackets
                    WHERE tournament_id = (SELECT tournament_id FROM CurrentTournament)
                )
                SELECT tb.* 
                FROM team_brackets tb
                WHERE tb.team_id IN (${teamIds.join(',')})
                AND tb.tournament_id = (SELECT tournament_id FROM CurrentTournament)
                AND tb.stage = (SELECT stage FROM MaxStage)`,
                []
            );
            console.log('Latest stage brackets:', result.rows);

            if (result.rows.length === 0) {
                return res.json({ 
                    scores: [],
                    message: 'No current brackets found for these teams',
                    teamIds
                });
            }

            // Fetch scores from the bracket API for each team
            const scores = await Promise.all(
                result.rows.map(async (row: any) => {
                    console.log('Processing bracket:', row);
                    const bracketUrl = `https://game-api.nfteams.club/brackets/${row.bracket_id}`;
                    const bracketResponse = await fetch(bracketUrl);
                    const bracketData = await bracketResponse.json();
                    console.log('Bracket API response tips:', bracketData);

                    // Count scored games
                    const totalGames = bracketData.bracket.games.length;
                    const scoredGames = bracketData.bracket.games.filter(
                        (game: any) => game.game.team_1_score !== null && game.game.team_2_score !== null
                    ).length;
                    console.log(`Games scored: ${scoredGames}/${totalGames}`);

                    // Calculate team's score using the same logic as apicalls.md
                    const teamTips = bracketData.bracket.tips.filter(
                        (tip: any) => tip.team_id === parseInt(row.team_id)
                    );
                    console.log('Team tips:', teamTips);

                    const totalScore = teamTips.reduce((sum: number, tip: any) => {
                        const score = parseFloat(tip.result || "0");
                        console.log(`Tip score: ${score} (${tip.result})`);
                        return sum + score;
                    }, 0);
                    console.log(`Total score for team ${row.team_id}: ${totalScore}`);

                    return {
                        team_id: parseInt(row.team_id),
                        bracket_id: row.bracket_id,
                        tournament_id: parseInt(row.tournament_id),
                        stage: parseInt(row.stage),
                        score: totalScore,
                        games_scored: scoredGames,
                        total_games: totalGames
                    };
                })
            );

            res.json({ 
                scores,
                message: scores.length > 0 ? undefined : 'No scores available yet',
                currentStage: result.rows[0]?.stage
            });
        } catch (error) {
            console.error('getCurrentScores error:', error);
            res.status(500).json({ 
                error: 'Failed to fetch current scores',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    async getLeaderboard(req: Request, res: Response) {
        try {
            const { wallet } = req.query;
            const years = ['2023', '2024', '2025'];
            const results: { [key: string]: { team_id: number; rank: number; total_points: number } | null } = {};

            if (wallet) {
                // Get owned NFTs first
                const collection = '0x03f5CeE0d698c24A42A396EC6BDAEe014057d4c8';
                const api_key = process.env.NEXT_PUBLIC_API;
                const baseURL = `https://eth-mainnet.g.alchemy.com/nft/v2/${api_key}/getNFTs/`;
                const fetchURL = `${baseURL}?owner=${wallet}&contractAddresses%5B%5D=${collection}`;
                
                const nftResponse = await fetch(fetchURL, { method: 'GET' });
                const nftData = await nftResponse.json();
                
                if (!nftData.ownedNfts || nftData.ownedNfts.length === 0) {
                    return res.status(404).json({ error: 'No NFTs found' });
                }

                const tokenIds = nftData.ownedNfts.map((nft: any) => parseInt(nft.id.tokenId, 16));

                // Query for each year
                for (const year of years) {
                    const tableName = `leaderboard${year.slice(-2)}`;
                    const placeholders = tokenIds.map(() => "?").join(",");
                    const query = `
                        SELECT team_id, rank, total_points 
                        FROM ${tableName} 
                        WHERE team_id IN (${placeholders})
                        ORDER BY rank
                        LIMIT 1
                    `;

                    const url = process.env.NEXT_PUBLIC_URL_FOUR;
                    const authToken = process.env.NEXT_PUBLIC_TOKEN_FOUR;
                    const response = await fetch(`${url}/v2/pipeline`, {
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
                                        sql: query,
                                        args: tokenIds.map((id: number) => ({ type: "integer", value: id.toString() }))
                                    }
                                },
                                { type: "close" }
                            ]
                        })
                    });

                    const data = await response.json();
                    const rows = data.results[0]?.response?.result?.rows || [];

                    if (rows.length > 0) {
                        results[year] = {
                            team_id: parseInt(rows[0][0].value),
                            rank: parseInt(rows[0][1].value),
                            total_points: parseFloat(rows[0][2].value)
                        };
                    } else {
                        results[year] = null;
                    }
                }

                // Format the response
                const formattedResponse = years
                    .filter(year => results[year])
                    .map(year => {
                        const team = results[year]!;
                        return {
                            year,
                            rank: team.rank,
                            team_id: team.team_id,
                            total_points: team.total_points
                        };
                    });

                res.json({ 
                    leaderboard: formattedResponse
                });
            } else {
                // Get top team for each year without wallet filter
                for (const year of years) {
                    const tableName = `leaderboard${year.slice(-2)}`;
                    const query = `
                        SELECT team_id, rank, total_points 
                        FROM ${tableName} 
                        ORDER BY rank
                        LIMIT 1
                    `;

                    const url = process.env.NEXT_PUBLIC_URL_FOUR;
                    const authToken = process.env.NEXT_PUBLIC_TOKEN_FOUR;
                    const response = await fetch(`${url}/v2/pipeline`, {
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
                                        sql: query,
                                        args: []
                                    }
                                },
                                { type: "close" }
                            ]
                        })
                    });

                    const data = await response.json();
                    const rows = data.results[0]?.response?.result?.rows || [];

                    if (rows.length > 0) {
                        results[year] = {
                            team_id: parseInt(rows[0][0].value),
                            rank: parseInt(rows[0][1].value),
                            total_points: parseFloat(rows[0][2].value)
                        };
                    } else {
                        results[year] = null;
                    }
                }

                // Format the response
                const formattedResponse = years
                    .filter(year => results[year])
                    .map(year => {
                        const team = results[year]!;
                        return {
                            year,
                            rank: team.rank,
                            team_id: team.team_id,
                            total_points: team.total_points
                        };
                    });

                res.json({ 
                    leaderboard: formattedResponse
                });
            }
        } catch (error) {
            console.error('getLeaderboard error:', error);
            res.status(500).json({ error: 'Failed to fetch leaderboard' });
        }
    }

    async getRoundStats(req: Request, res: Response) {
        try {
            const { wallet } = req.params;

            // Get owned NFTs first
            const collection = '0x03f5CeE0d698c24A42A396EC6BDAEe014057d4c8';
            const api_key = process.env.NEXT_PUBLIC_API;
            const baseURL = `https://eth-mainnet.g.alchemy.com/nft/v2/${api_key}/getNFTs/`;
            const fetchURL = `${baseURL}?owner=${wallet}&contractAddresses%5B%5D=${collection}`;
            
            const nftResponse = await fetch(fetchURL, { method: 'GET' });
            const nftData = await nftResponse.json();
            
            if (!nftData.ownedNfts || nftData.ownedNfts.length === 0) {
                return res.status(404).json({ error: 'No NFTs found' });
            }

            const teamIds = nftData.ownedNfts.map((nft: any) => parseInt(nft.id.tokenId, 16));
            console.log('Team IDs:', teamIds);

            const url = process.env.NEXT_PUBLIC_URL_FOUR;
            const authToken = process.env.NEXT_PUBLIC_TOKEN_FOUR;

            if (!url?.startsWith('https://')) {
                throw new Error('Invalid URL format. URL must start with https://');
            }

            const placeholders = teamIds.map(() => "?").join(",");
            const query2023 = `
                SELECT round, COUNT(*) as total_games,
                       SUM(CASE WHEN c_winloss = 'W' THEN 1 ELSE 0 END) as wins
                FROM nfteams2023 
                WHERE team_id IN (${placeholders})
                GROUP BY round
                ORDER BY round`;
            const query2024 = `
                SELECT round, COUNT(*) as total_games,
                       SUM(CASE WHEN c_winloss = 'W' THEN 1 ELSE 0 END) as wins
                FROM nfteams2024 
                WHERE team_id IN (${placeholders})
                GROUP BY round
                ORDER BY round`;
            const query2025 = `
                SELECT round, COUNT(*) as total_games,
                       SUM(CASE WHEN c_winloss = 'W' THEN 1 ELSE 0 END) as wins
                FROM nfteams2025 
                WHERE team_id IN (${placeholders})
                GROUP BY round
                ORDER BY round`;

            const response = await fetch(`${url}/v2/pipeline`, {
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
                                sql: query2023,
                                args: teamIds.map((id: number) => ({
                                    type: "integer",
                                    value: id.toString()
                                }))
                            }
                        },
                        {
                            type: "execute",
                            stmt: {
                                sql: query2024,
                                args: teamIds.map((id: number) => ({
                                    type: "integer",
                                    value: id.toString()
                                }))
                            }
                        },
                        {
                            type: "execute",
                            stmt: {
                                sql: query2025,
                                args: teamIds.map((id: number) => ({
                                    type: "integer",
                                    value: id.toString()
                                }))
                            }
                        },
                        { type: "close" }
                    ]
                })
            });

            if (!response.ok) {
                const text = await response.text();
                console.error('Response not OK:', response.status, text);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Combine rows from all queries
            const rows2023 = data.results[0]?.response?.result?.rows || [];
            const rows2024 = data.results[1]?.response?.result?.rows || [];
            const rows2025 = data.results[2]?.response?.result?.rows || [];
            const allRows = [...rows2023, ...rows2024, ...rows2025];

            // Group and summarize data across all years
            const summary = allRows.reduce((acc: { [key: string]: { total: number, wins: number } }, row: any) => {
                const roundNum = parseInt(row[0].value);
                if (!acc[roundNum]) {
                    acc[roundNum] = {
                        total: 0,
                        wins: 0
                    };
                }
                
                // Add totals and wins
                const totalGames = parseInt(row[1].value);
                const wins = parseInt(row[2].value);
                acc[roundNum].total += totalGames;
                acc[roundNum].wins += wins;
                
                return acc;
            }, {});

            // Format the results
            const roundStats = Object.entries(summary)
                .sort(([a], [b]) => parseInt(a) - parseInt(b))  // Sort rounds numerically
                .map(([round, stats]) => ({
                    round: parseInt(round),
                    total_games: stats.total,
                    win_percentage: stats.total > 0 
                        ? ((stats.wins / stats.total) * 100).toFixed(1)
                        : '0.0'
                }));

            res.json({
                rounds: roundStats,
                teamIds
            });

        } catch (error) {
            console.error('getRoundStats error:', error);
            res.status(500).json({ 
                error: 'Failed to fetch round statistics',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    async getHistoricalPerformance(req: Request, res: Response) {
        // To be implemented based on the requirements in point 7
        res.status(501).json({ error: 'Not implemented yet' });
    }
} 