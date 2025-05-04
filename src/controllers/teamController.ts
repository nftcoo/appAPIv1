import { Request, Response } from 'express';
import { TursoClient } from '../services/tursoClient';
import { NFT, TeamDetails } from '../types/team';
import { ethers } from 'ethers';
import { NFT_CONTRACT_ADDRESS, NFT_CONTRACT_ABI, ETHEREUM_RPC_URL } from '../config/constants';

const tursoClient = new TursoClient();

export class TeamController {
    private provider: ethers.providers.JsonRpcProvider;
    private nftContract: ethers.Contract;

    constructor() {
        this.provider = new ethers.providers.JsonRpcProvider(ETHEREUM_RPC_URL);
        this.nftContract = new ethers.Contract(NFT_CONTRACT_ADDRESS, NFT_CONTRACT_ABI, this.provider);
    }

    async verifyNFTOwnership(wallet: string): Promise<boolean> {
        try {
            console.log(`Verifying NFT ownership for wallet: ${wallet}`);
            
            const collection = NFT_CONTRACT_ADDRESS;
            const api_key = process.env.NEXT_PUBLIC_API;
            const baseURL = `https://eth-mainnet.g.alchemy.com/nft/v2/${api_key}/getNFTs/`;
            const fetchURL = `${baseURL}?owner=${wallet}&contractAddresses%5B%5D=${collection}`;
            
            const response = await fetch(fetchURL, { method: 'GET' });
            const data = await response.json();
            
            console.log('NFT ownership response:', data);
            
            if (!data.ownedNfts) {
                return false;
            }
            
            return data.ownedNfts.length > 0;
        } catch (error) {
            console.error('Error verifying NFT ownership:', error);
            throw new Error('Failed to verify NFT ownership');
        }
    }

    async verifyNFTOwnershipHandler(req: Request, res: Response): Promise<void> {
        try {
            const { wallet } = req.params;
            const hasNFT = await this.verifyNFTOwnership(wallet);
            res.json({ hasNFT });
        } catch (error) {
            console.error('Error in NFT ownership handler:', error);
            res.status(500).json({ error: 'Failed to verify NFT ownership' });
        }
    }

    async getOwnedNFTs(req: Request, res: Response): Promise<void> {
        try {
            const { wallet } = req.params;
            
            if (!wallet) {
                res.status(400).json({ error: 'Wallet address is required' });
                return;
            }

            const collection = NFT_CONTRACT_ADDRESS;
            const api_key = process.env.NEXT_PUBLIC_API;
            const baseURL = `https://eth-mainnet.g.alchemy.com/nft/v2/${api_key}/getNFTs/`;
            const fetchURL = `${baseURL}?owner=${wallet}&contractAddresses%5B%5D=${collection}`;
            
            const response = await fetch(fetchURL, { method: 'GET' });
            const data = await response.json();

            if (!data.ownedNfts) {
                throw new Error('Invalid response from NFT API');
            }

            const nfts = data.ownedNfts;
            const teams = nfts.map((nft: NFT) => ({
                id: parseInt(nft.id.tokenId, 16),
                name: nft.title || `Team ${parseInt(nft.id.tokenId, 16)}`
            }));

            res.json(teams);
        } catch (error) {
            console.error('getOwnedNFTs error:', error);
            res.status(500).json({ error: 'Failed to fetch NFTs' });
        }
    }

    async getTeamDetails(req: Request, res: Response): Promise<void> {
        try {
            const { teamId } = req.params;
            
            // Get current bracket info
            const result = await tursoClient.executeQuery(
                `WITH LatestBracket AS (
                    SELECT * FROM team_brackets 
                    WHERE team_id = ? 
                    ORDER BY tournament_id DESC, stage DESC 
                    LIMIT 1
                )
                SELECT 
                    tb.team_id,
                    tb.bracket_id,
                    tb.tournament_id,
                    tb.stage
                FROM LatestBracket tb`,
                [teamId]
            );

            // Fetch team name from NFT metadata
            const metadataResponse = await fetch(
                `https://s3.ap-southeast-2.amazonaws.com/nft-meta.nfteams.club/${teamId}`
            );
            const metadata = await metadataResponse.json();

            const teamDetails: TeamDetails = {
                teamId: parseInt(teamId),
                name: metadata.name,
                currentBracket: result.rows[0]?.bracket_id,
                currentStage: result.rows[0]?.stage
            };

            res.json(teamDetails);
        } catch (error) {
            console.error('getTeamDetails error:', error);
            res.status(500).json({ error: 'Failed to fetch team details' });
        }
    }

    async getTeams(req: Request, res: Response): Promise<void> {
        try {
            const { walletAddress } = req.params;
            
            const hasNFT = await this.verifyNFTOwnership(walletAddress);
            if (!hasNFT) {
                res.status(403).json({ error: 'No NFT ownership verified' });
                return;
            }

            const result = await tursoClient.executeQuery('SELECT * FROM teams', []);
            res.json(result.rows);
        } catch (error) {
            console.error('Error getting teams:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async getFavoriteTeam(req: Request, res: Response): Promise<void> {
        try {
            const { walletAddress } = req.params;
            
            const hasNFT = await this.verifyNFTOwnership(walletAddress);
            if (!hasNFT) {
                res.status(403).json({ error: 'No NFT ownership verified' });
                return;
            }

            const result = await tursoClient.executeQuery(
                `SELECT ft.*, t.* 
                FROM favorite_teams ft 
                JOIN teams t ON ft.team_id = t.id 
                WHERE ft.wallet_address = ?`,
                [walletAddress]
            );

            res.json(result.rows[0] || null);
        } catch (error) {
            console.error('Error getting favorite team:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async setFavoriteTeam(req: Request, res: Response): Promise<void> {
        try {
            const { walletAddress } = req.params;
            const { teamId } = req.body;
            
            const hasNFT = await this.verifyNFTOwnership(walletAddress);
            if (!hasNFT) {
                res.status(403).json({ error: 'No NFT ownership verified' });
                return;
            }

            // First delete any existing favorite team for this wallet
            await tursoClient.executeQuery(
                'DELETE FROM favorite_teams WHERE wallet_address = ?',
                [walletAddress]
            );

            // Then insert the new favorite team
            await tursoClient.executeQuery(
                'INSERT INTO favorite_teams (wallet_address, team_id) VALUES (?, ?)',
                [walletAddress, teamId]
            );

            const result = await tursoClient.executeQuery(
                'SELECT * FROM favorite_teams WHERE wallet_address = ?',
                [walletAddress]
            );

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error setting favorite team:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
} 