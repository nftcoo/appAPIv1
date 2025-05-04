import { Request, Response } from 'express';
import { TursoClient } from '../services/tursoClient';
import { AuthRequest } from '../middleware/auth';

export class UserController {
  private tursoClient: TursoClient;

  constructor() {
    this.tursoClient = new TursoClient();
  }

  private async getTeamMetadata(teamId: number): Promise<any> {
    try {
      const metadataURL = `https://s3.ap-southeast-2.amazonaws.com/nft-meta.nfteams.club/${teamId}`;
      console.log('Fetching team metadata from:', metadataURL);
      
      const metadataResponse = await fetch(metadataURL);
      const metadata = await metadataResponse.json();
      console.log('Team metadata:', metadata);
      
      return metadata;
    } catch (error) {
      console.error('Error fetching team metadata:', error);
      return null;
    }
  }

  private async verifyNFTOwnership(wallet: string, teamId: number): Promise<boolean> {
    try {
      const collection = '0x03f5CeE0d698c24A42A396EC6BDAEe014057d4c8';
      const api_key = process.env.NEXT_PUBLIC_API;
      const baseURL = `https://eth-mainnet.g.alchemy.com/nft/v2/${api_key}/getNFTs/`;
      const fetchURL = `${baseURL}?owner=${wallet}&contractAddresses%5B%5D=${collection}`;
      
      console.log('Verifying NFT ownership with URL:', fetchURL);
      
      const nftResponse = await fetch(fetchURL, { method: 'GET' });
      const nftData = await nftResponse.json();
      
      console.log('NFT ownership response:', nftData);
      
      if (!nftData.ownedNfts) {
        return false;
      }

      const ownedTeams = nftData.ownedNfts.map((nft: any) => parseInt(nft.id.tokenId, 16));
      console.log('Owned teams:', ownedTeams);
      
      return ownedTeams.includes(teamId);
    } catch (error) {
      console.error('Error verifying NFT ownership:', error);
      return false;
    }
  }

  async setFavoriteTeam(req: Request, res: Response): Promise<void> {
    try {
      const teamId = parseInt(req.body.teamId);
      const wallet = (req as AuthRequest).user?.wallet_address;

      console.log('Setting favorite team:', { teamId, wallet });

      if (!wallet) {
        res.status(401).json({ error: 'Wallet address not found in token' });
        return;
      }

      if (isNaN(teamId)) {
        res.status(400).json({ error: 'Invalid Team ID format' });
        return;
      }

      // Get team metadata
      const metadata = await this.getTeamMetadata(teamId);
      if (!metadata) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }

      // Verify NFT ownership
      const hasNFT = await this.verifyNFTOwnership(wallet, teamId);
      if (!hasNFT) {
        res.status(403).json({ error: 'You do not own this NFT' });
        return;
      }

      // Update the user's favorite team using parameterized query
      await this.tursoClient.executeQuery(
        'UPDATE app_users SET team_id = ?, team_image_url = ? WHERE wallet_address = ?',
        [teamId, metadata.image || '', wallet]
      );

      console.log('Updated favorite team in database');

      res.json({ 
        message: 'Favorite team updated successfully',
        teamId,
        imageUrl: metadata.image || null
      });
    } catch (error) {
      console.error('setFavoriteTeam error:', error);
      res.status(500).json({ error: 'Failed to update favorite team' });
    }
  }

  async getFavoriteTeam(req: Request, res: Response): Promise<void> {
    try {
      console.log('Getting favorite team for request:', {
        headers: req.headers,
        user: (req as AuthRequest).user
      });

      const wallet = (req as AuthRequest).user?.wallet_address;
      console.log('Wallet address from token:', wallet);

      if (!wallet) {
        console.log('No wallet address found in token');
        res.status(401).json({ error: 'Wallet address not found in token' });
        return;
      }

      console.log('Executing query for wallet:', wallet);
      const result = await this.tursoClient.executeQuery(
        `SELECT team_id, team_image_url FROM app_users WHERE wallet_address = '${wallet}'`
      );
      console.log('Query result:', result);

      if (result.rows.length === 0) {
        console.log('No user found for wallet:', wallet);
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const user = result.rows[0];
      console.log('Found user data:', user);
      
      res.json({
        teamId: user.team_id,
        imageUrl: user.team_image_url
      });
    } catch (error) {
      console.error('getFavoriteTeam error:', error);
      res.status(500).json({ error: 'Failed to fetch favorite team' });
    }
  }
} 