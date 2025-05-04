import express, { Request, Response } from 'express';
import { ScoreController } from '../controllers/scoreController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();
const scoreController = new ScoreController();

// Existing routes
router.get('/current/:wallet', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    await scoreController.getCurrentScores(req, res);
});

router.get('/leaderboard', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    await scoreController.getLeaderboard(req, res);
});

// New round stats route
router.get('/rounds/:wallet', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    await scoreController.getRoundStats(req, res);
});

export default router; 