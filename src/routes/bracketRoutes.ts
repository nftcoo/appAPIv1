import express, { Request, Response } from 'express';
import { BracketController } from '../controllers/bracketController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();
const bracketController = new BracketController();

// Existing routes
router.get('/current/:wallet', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    await bracketController.getCurrentBrackets(req, res);
});

// New finals route
router.get('/finals/latest', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    await bracketController.getFinalRoundBrackets(req, res);
});

// New team brackets route
router.post('/teams', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    await bracketController.getTeamBrackets(req, res);
});

// New route for latest finals bracket ID
router.get('/finals/latest-id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    await bracketController.getLatestFinalsBracket(req, res);
});

export default router; 