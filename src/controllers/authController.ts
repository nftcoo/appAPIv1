import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import { TursoClient } from '../services/tursoClient';
import { TeamController } from './teamController';

const tursoClient = new TursoClient();
const teamController = new TeamController();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
}

// Define the LoginCredentials interface
interface LoginCredentials {
  wallet_address: string;
}

export class AuthController {
  // Validate wallet address (0x or ENS)
  private async validateWalletAddress(address: string): Promise<string> {
    try {
      // Check if it's an ENS name
      if (address.endsWith('.eth')) {
        // For now, we'll just validate the format
        if (!/^[a-zA-Z0-9-]+\.eth$/.test(address)) {
          throw new Error('Invalid ENS format');
        }
        return address.toLowerCase();
      }
      
      // Validate Ethereum address
      if (!ethers.utils.isAddress(address)) {
        throw new Error('Invalid Ethereum address');
      }
      
      // Return checksummed address
      return ethers.utils.getAddress(address);
    } catch (error) {
      throw new Error('Invalid wallet address');
    }
  }

  async register(req: Request<{}, {}, LoginCredentials>, res: Response) {
    try {
      const { wallet_address } = req.body;
      
      // Validate and format the wallet address
      const validatedAddress = await this.validateWalletAddress(wallet_address);
      
      // Check if user exists
      const existingUser = await tursoClient.executeQuery(
        'SELECT * FROM app_users WHERE wallet_address = ?',
        [validatedAddress]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Wallet address already registered' });
      }

      // Create user
      await tursoClient.executeQuery(
        'INSERT INTO app_users (wallet_address) VALUES (?)',
        [validatedAddress]
      );

      res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
      console.error('Registration error:', error);
      if (error instanceof Error && error.message === 'Invalid wallet address') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async login(req: Request, res: Response) {
    try {
      // Handle both wallet_address and address formats
      const walletAddress = req.body.wallet_address || req.body.address;
      
      if (!walletAddress) {
        return res.status(400).json({ error: 'Wallet address is required' });
      }
      
      console.log('Login attempt with wallet:', walletAddress);
      
      const normalizedAddress = await this.validateWalletAddress(walletAddress);
      console.log('Normalized address:', normalizedAddress);

      // Verify NFT ownership
      const hasNFT = await teamController.verifyNFTOwnership(normalizedAddress);
      console.log('NFT ownership verified:', hasNFT);
      
      if (!hasNFT) {
        return res.status(403).json({ error: 'No NFT ownership verified' });
      }

      // Get or create user
      const result = await tursoClient.executeQuery(
        `SELECT * FROM app_users WHERE wallet_address = '${normalizedAddress}'`
      );

      let userId;
      if (result.rows.length === 0) {
        // Create new user
        const insertResult = await tursoClient.executeQuery(
          `INSERT INTO app_users (wallet_address) VALUES ('${normalizedAddress}') RETURNING id`
        );
        userId = insertResult.rows[0].id;
      } else {
        userId = result.rows[0].id;
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId, wallet_address: normalizedAddress },
        JWT_SECRET as string,
        { expiresIn: '7d' }
      );

      console.log('Login successful for user:', userId);
      
      res.json({ 
        token, 
        user: {
          id: userId,
          wallet_address: normalizedAddress
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  }
}
