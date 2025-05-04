import express from 'express';
import { SummaryController } from '../controllers/summaryController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();
const summaryController = new SummaryController();

router.get('/:wallet', authenticateToken, summaryController.getWalletSummary.bind(summaryController));

export default router; 