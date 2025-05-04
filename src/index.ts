// src/index.ts
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { AuthController } from './controllers/authController';
import { authenticateToken } from './middleware/auth';
import { Request, Response } from 'express';
import { LoginCredentials } from './types/auth';
import { AuthRequest } from './middleware/auth';
import { TeamController } from './controllers/teamController';
import { BracketController } from './controllers/bracketController';
import { ScoreController } from './controllers/scoreController';
import { CompetitionController } from './controllers/competitionController';
import summaryRoutes from './routes/summaryRoutes';
import bracketRoutes from './routes/bracketRoutes';
import userRoutes from './routes/userRoutes';

const app = express();
const port = process.env.PORT || 3000;
const authController = new AuthController();
const teamController = new TeamController();
const bracketController = new BracketController();
const scoreController = new ScoreController();
const competitionController = new CompetitionController();

// Middleware
// Configure CORS to allow requests from any origin during development
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(helmet());
app.use(compression());
app.use(express.json());

// Add a simple test endpoint
app.get('/test', (req: Request, res: Response) => {
  res.json({ message: 'API server is running!' });
});

// Routes
app.post(
  '/auth/register', 
  (req: Request<{}, {}, LoginCredentials>, res: Response) => {
    authController.register(req, res);
  }
);
app.post(
  '/auth/login', 
  (req: Request<{}, {}, LoginCredentials>, res: Response) => {
    authController.login(req, res);
  }
);

// Test protected route
app.get('/api/test-auth', authenticateToken, (req: Request, res: Response) => {
  res.json({ 
    message: 'You are authenticated!',
    user: (req as AuthRequest).user 
  });
});

// Public NFT verification endpoint (no auth required)
app.get('/api/teams/verify/:wallet', (req: Request, res: Response) => {
  const walletAddress = req.params.wallet;
  console.log('Verifying NFT ownership for wallet:', walletAddress);
  
  // Call the teamController's verifyNFTOwnership method
  teamController.verifyNFTOwnership(walletAddress)
    .then(hasNFT => {
      console.log('NFT verification result:', hasNFT);
      res.json({ hasNFT });
    })
    .catch(error => {
      console.error('Error verifying NFT ownership:', error);
      res.status(500).json({ error: 'Failed to verify NFT ownership' });
    });
});

// Public endpoint for getting owned teams
app.get('/api/teams/:wallet', (req: Request, res: Response) => {
  teamController.getOwnedNFTs(req, res);
});

// Team routes
app.get('/api/teams/details/:teamId', authenticateToken, (req: Request, res: Response) => {
  teamController.getTeamDetails(req, res);
});

// Bracket routes
app.get('/api/brackets/current/:wallet', authenticateToken, (req: Request, res: Response) => {
    bracketController.getCurrentBrackets(req, res);
});

app.get('/api/brackets/final', authenticateToken, (req: Request, res: Response) => {
    bracketController.getFinalRoundBrackets(req, res);
});

app.get('/api/brackets/winners/:wallet', authenticateToken, (req: Request, res: Response) => {
    bracketController.getLastRoundWinners(req, res);
});

// New team brackets route
app.post('/api/brackets/teams', authenticateToken, (req: Request, res: Response) => {
    bracketController.getTeamBrackets(req, res);
});

// Score routes
app.get('/api/scores/current/:wallet', authenticateToken, (req: Request, res: Response) => {
    scoreController.getCurrentScores(req, res);
});

app.get('/api/scores/leaderboard', authenticateToken, (req: Request, res: Response) => {
    scoreController.getLeaderboard(req, res);
});

app.get('/api/scores/rounds/:wallet', authenticateToken, (req: Request, res: Response) => {
    scoreController.getRoundStats(req, res);
});

app.get('/api/scores/history', authenticateToken, (req: Request, res: Response) => {
    scoreController.getHistoricalPerformance(req, res);
});

// Competition routes
app.post('/api/competition/enter', authenticateToken, (req: Request, res: Response) => {
    competitionController.enterCompetition(req, res);
});

app.post('/api/competition/update-scores', authenticateToken, (req: Request, res: Response) => {
    competitionController.updateCompScores(req, res);
});

// Summary routes
app.use('/api/summary', summaryRoutes);

// Bracket routes
app.use('/api/brackets', bracketRoutes);

// Add user routes
app.use('/api/users', userRoutes);

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});