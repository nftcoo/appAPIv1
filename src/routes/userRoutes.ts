import express from 'express';
import { UserController } from '../controllers/userController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();
const userController = new UserController();

router.post('/favorite-team', authenticateToken, userController.setFavoriteTeam.bind(userController));
router.get('/favorite-team', authenticateToken, userController.getFavoriteTeam.bind(userController));

export default router; 