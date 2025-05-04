import { Request, Response } from 'express';
import { TursoClient } from '../services/tursoClient';
import { SportSummary } from '../types/summary';

export class SummaryController {
    private tursoClient: TursoClient;

    constructor() {
        this.tursoClient = new TursoClient();
    }

    async getWalletSummary(req: Request, res: Response): Promise<void> {
        try {
            const { wallet } = req.params;
            console.log('1. Wallet address from params:', wallet);

            // Verify NFT ownership first
            const collection = '0x03f5CeE0d698c24A42A396EC6BDAEe014057d4c8';
            const api_key = process.env.NEXT_PUBLIC_API;
            const baseURL = `https://eth-mainnet.g.alchemy.com/nft/v2/${api_key}/getNFTs/`;
            const fetchURL = `${baseURL}?owner=${wallet}&contractAddresses%5B%5D=${collection}`;
            console.log('2. Fetching NFTs from URL:', fetchURL);
            
            const nftResponse = await fetch(fetchURL, { method: 'GET' });
            const nftData = await nftResponse.json();
            console.log('3. NFT Response data:', JSON.stringify(nftData, null, 2));
            
            if (!nftData.ownedNfts) {
                console.log('4a. No NFTs found for wallet');
                res.status(404).json({ error: 'No NFTs found' });
                return;
            }

            const teamIds = nftData.ownedNfts.map((nft: any) => parseInt(nft.id.tokenId, 16));
            const teamIdsStr = teamIds.join(',');
            console.log('4b. Found team IDs:', teamIds);
            console.log('4c. Team IDs string for query:', teamIdsStr);

            const query2023 = `
                SELECT sport_c, COUNT(*) as total,
                SUM(CASE WHEN c_winloss = 'W' THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN c_winloss = 'L' THEN 1 ELSE 0 END) as losses
                FROM nfteams2023 
                WHERE team_id IN (${teamIdsStr})
                GROUP BY sport_c
            `;
            const query2024 = `
                SELECT sport_c, COUNT(*) as total,
                SUM(CASE WHEN c_winloss = 'W' THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN c_winloss = 'L' THEN 1 ELSE 0 END) as losses
                FROM nfteams2024 
                WHERE team_id IN (${teamIdsStr})
                GROUP BY sport_c
            `;
            const query2025 = `
                SELECT sport_c, COUNT(*) as total,
                SUM(CASE WHEN c_winloss = 'W' THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN c_winloss = 'L' THEN 1 ELSE 0 END) as losses
                FROM nfteams2025 
                WHERE team_id IN (${teamIdsStr})
                GROUP BY sport_c
            `;
            console.log('5. Example query (2023):', query2023);

            const [rows2023, rows2024, rows2025] = await Promise.all([
                this.tursoClient.executeQuery(query2023, []),
                this.tursoClient.executeQuery(query2024, []),
                this.tursoClient.executeQuery(query2025, [])
            ]);

            console.log('6. Query results:', {
                '2023': rows2023.rows,
                '2024': rows2024.rows,
                '2025': rows2025.rows
            });

            // Process results and calculate summary
            const sportSummary = this.processSummaryData([...rows2023.rows, ...rows2024.rows, ...rows2025.rows]);
            console.log('7. Final processed summary:', sportSummary);

            res.json({ success: true, data: sportSummary });
        } catch (error) {
            console.error('getWalletSummary error:', error);
            res.status(500).json({ error: 'Failed to fetch summary data' });
        }
    }

    private processSummaryData(rows: any[]): SportSummary[] {
        const summary: Record<string, { total: number; wins: number; losses: number }> = {};
        
        rows.forEach(row => {
            const sport = row.sport_c;
            if (!summary[sport]) {
                summary[sport] = { total: 0, wins: 0, losses: 0 };
            }
            summary[sport].total += parseInt(row.total);
            summary[sport].wins += parseInt(row.wins);
            summary[sport].losses += parseInt(row.losses);
        });

        return Object.entries(summary).map(([sport, stats]) => ({
            sport,
            total: stats.total,
            wins: stats.wins,
            losses: stats.losses,
            winRate: stats.total ? ((stats.wins/stats.total)*100).toFixed(1) : '0'
        }));
    }
} 