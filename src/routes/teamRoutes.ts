import express, { Request, Response, RequestHandler } from 'express';
import { TeamController } from '../controllers/teamController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();
const teamController = new TeamController();

const verifyNFTOwnershipHandler: RequestHandler = async (req, res) => {
    await teamController.verifyNFTOwnershipHandler(req, res);
};

const getOwnedNFTsHandler: RequestHandler = async (req, res) => {
    await teamController.getOwnedNFTs(req, res);
};

const getTeamDetailsHandler: RequestHandler = async (req, res) => {
    await teamController.getTeamDetails(req, res);
};

// Public route for initial NFT verification
router.get('/verify/:wallet', verifyNFTOwnershipHandler);

// Protected routes that require authentication
router.get('/:wallet', authenticateToken, getOwnedNFTsHandler);
router.get('/details/:teamId', authenticateToken, getTeamDetailsHandler);

export default router; 