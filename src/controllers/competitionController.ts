import { Request, Response } from 'express';
import { TursoClient } from '../services/tursoClient';
import { AuthRequest } from '../middleware/auth';

interface TeamScore {
    teamId: number;
    totalScore: number;
}

export class CompetitionController {
    private tursoClient: TursoClient;

    constructor() {
        this.tursoClient = new TursoClient();
    }

    async enterCompetition(req: Request, res: Response) {
        try {
            const { teamId } = req.body;
            const wallet = (req as AuthRequest).user?.wallet_address;
            
            if (!wallet) {
                return res.status(401).json({ 
                    text: 'Wallet address not found in token',
                    type: 'text'
                });
            }

            const url = process.env.NEXT_PUBLIC_URL_FOUR;
            const authToken = process.env.NEXT_PUBLIC_TOKEN_FOUR;
            
            if (!url?.startsWith('https://')) {
                throw new Error('Invalid URL format. URL must start with https://');
            }

            // Check for PENDING competition
            const compResponse = await fetch(`${url}/v2/pipeline`, {
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
                                sql: 'SELECT id, entry_fee, contract_address FROM betting_rounds WHERE status = ?',
                                args: [{ type: "text", value: "PENDING" }]
                            }
                        },
                        { type: "close" }
                    ]
                })
            });

            const compData = await compResponse.json();
            console.log('Competition lookup response:', compData);

            if (!compData?.results?.[0]?.response?.result?.rows?.length) {
                return res.json({
                    text: "No open competition available for entry",
                    type: 'text'
                });
            }

            const compId = compData.results[0].response.result.rows[0][0].value;
            const entryFee = compData.results[0].response.result.rows[0][1].value;
            const contractAddress = compData.results[0].response.result.rows[0][2].value;

            // Check for existing entry
            const existingEntryResponse = await fetch(`${url}/v2/pipeline`, {
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
                                sql: 'SELECT id FROM comp_entries WHERE comp_id = ? AND wallet_address = ?',
                                args: [
                                    { type: "text", value: compId.toString() },
                                    { type: "text", value: wallet }
                                ]
                            }
                        },
                        { type: "close" }
                    ]
                })
            });

            const existingEntryData = await existingEntryResponse.json();
            console.log('Existing entry check response:', existingEntryData);

            if (existingEntryData?.results?.[0]?.response?.result?.rows?.length > 0) {
                return res.json({
                    text: "You have already entered this competition",
                    type: 'text'
                });
            }

            // Verify team ownership
            const apiKey = process.env.NEXT_PUBLIC_API;
            const nftContractAddress = '0x03f5CeE0d698c24A42A396EC6BDAEe014057d4c8';
            const fetchURL = `https://eth-mainnet.g.alchemy.com/nft/v2/${apiKey}/getNFTs/?owner=${wallet}&contractAddresses%5B%5D=${nftContractAddress}`;
            
            const nftResponse = await fetch(fetchURL, { method: 'GET' });
            const nftData = await nftResponse.json();
            const ownedTeams = nftData.ownedNfts?.map((nft: any) => parseInt(nft.id.tokenId, 16)) || [];

            if (!ownedTeams.includes(parseInt(teamId))) {
                return res.json({
                    text: `You don't own Team ${teamId}. Please enter a team that you own.`,
                    type: 'text'
                });
            }

            // Create pending entry
            const entryResponse = await fetch(`${url}/v2/pipeline`, {
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
                                sql: 'INSERT INTO comp_entries (comp_id, team_id, wallet_address, fee_amount, status) VALUES (?, ?, ?, ?, ?) RETURNING id',
                                args: [
                                    { type: "text", value: compId.toString() },
                                    { type: "text", value: teamId.toString() },
                                    { type: "text", value: wallet },
                                    { type: "text", value: entryFee.toString() },
                                    { type: "text", value: "PENDING" }
                                ]
                            }
                        },
                        { type: "close" }
                    ]
                })
            });

            const entryResult = await entryResponse.json();
            console.log('Entry creation response:', entryResult);

            return res.json({
                text: `Entry pending for Team ${teamId} in Competition ${compId}\nPlease send ${entryFee} ETH to ${contractAddress}\nYour entry will be confirmed once payment is received`,
                type: 'text'
            });

        } catch (error) {
            console.error('enterCompetition error:', error);
            return res.status(500).json({ 
                text: 'Failed to enter competition',
                type: 'text',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    async updateCompScores(req: Request, res: Response) {
        try {
            const url = process.env.NEXT_PUBLIC_URL_FOUR;
            const authToken = process.env.NEXT_PUBLIC_TOKEN_FOUR;

            // Check for active competition
            const compResponse = await fetch(`${url}/v2/pipeline`, {
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
                                sql: 'SELECT id FROM betting_rounds WHERE status = ?',
                                args: [{ type: "text", value: "ACTIVE" }]
                            }
                        },
                        { type: "close" }
                    ]
                })
            });

            const compData = await compResponse.json();
            console.log('Active competition check:', compData);

            if (!compData?.results?.[0]?.response?.result?.rows?.length) {
                return res.json({
                    text: "No active competition found",
                    type: 'text'
                });
            }

            const compId = compData.results[0].response.result.rows[0][0].value;

            // Get confirmed entries
            const entriesResponse = await fetch(`${url}/v2/pipeline`, {
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
                                sql: 'SELECT id, team_id FROM comp_entries WHERE comp_id = ? AND status = ?',
                                args: [
                                    { type: "text", value: compId.toString() },
                                    { type: "text", value: "CONFIRMED" }
                                ]
                            }
                        },
                        { type: "close" }
                    ]
                })
            });

            const entriesData = await entriesResponse.json();
            console.log('Confirmed entries:', entriesData);

            if (!entriesData?.results?.[0]?.response?.result?.rows?.length) {
                return res.json({
                    text: "No scores to update - either comp has not started or it has finished",
                    type: 'text'
                });
            }

            const entries = entriesData.results[0].response.result.rows.map((row: any) => ({
                entryId: row[0].value,
                teamId: row[1].value
            }));

            // Get scores for each team
            const scores: TeamScore[] = [];
            for (const entry of entries) {
                // Get latest bracket for team
                const bracketResponse = await fetch(`${url}/v2/pipeline`, {
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
                                    sql: `
                                        SELECT id, bracket_id, tournament_id, stage, team_id 
                                        FROM team_brackets 
                                        WHERE team_id = ? 
                                        ORDER BY bracket_id DESC 
                                        LIMIT 1
                                    `,
                                    args: [{ type: "integer", value: entry.teamId }]
                                }
                            },
                            { type: "close" }
                        ]
                    })
                });

                const bracketData = await bracketResponse.json();
                if (!bracketData?.results?.[0]?.response?.result?.rows?.length) {
                    console.log(`No bracket found for team ${entry.teamId}`);
                    continue;
                }

                const bracket = {
                    id: bracketData.results[0].response.result.rows[0][0].value,
                    bracket_id: bracketData.results[0].response.result.rows[0][1].value,
                    tournament_id: bracketData.results[0].response.result.rows[0][2].value,
                    stage: bracketData.results[0].response.result.rows[0][3].value,
                    team_id: bracketData.results[0].response.result.rows[0][4].value
                };

                // Get bracket details from API
                const bracketUrl = `https://game-api.nfteams.club/brackets/${bracket.bracket_id}`;
                const bracketResponse2 = await fetch(bracketUrl);
                const bracketDetails = await bracketResponse2.json();

                // Calculate team's score
                const teamTips = bracketDetails.bracket.tips.filter(
                    (tip: any) => parseInt(tip.team_id) === parseInt(entry.teamId)
                );

                const totalScore = teamTips.reduce((sum: number, tip: any) => {
                    const result = tip.result ? parseFloat(tip.result) : 0;
                    console.log(`Team ${entry.teamId} tip result:`, result);
                    return sum + result;
                }, 0);

                console.log(`Team ${entry.teamId} total score:`, totalScore);

                scores.push({ teamId: entry.teamId, totalScore });

                // Update score in database
                await fetch(`${url}/v2/pipeline`, {
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
                                    sql: 'UPDATE comp_entries SET current_score = ? WHERE id = ?',
                                    args: [
                                        { type: "float", value: totalScore },
                                        { type: "text", value: entry.entryId.toString() }
                                    ]
                                }
                            },
                            { type: "close" }
                        ]
                    })
                });
            }

            // Sort scores and create leaderboard
            scores.sort((a, b) => b.totalScore - a.totalScore);
            const leaderboard = scores.map((score, index) => 
                `${index + 1}. Team ${score.teamId}: ${score.totalScore.toFixed(2)} points`
            ).join('\n');

            return res.json({
                text: `Competition ${compId} Leaderboard:\n${leaderboard}`,
                type: 'text'
            });

        } catch (error) {
            console.error('updateCompScores error:', error);
            return res.status(500).json({ 
                text: 'Failed to update competition scores',
                type: 'text',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
} 