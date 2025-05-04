import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
}

export interface AuthRequest extends Request {
  user?: {
    userId: number;
    wallet_address: string;
    team_id?: number;
  };
}

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers['authorization'];
  console.log('Auth header:', authHeader);
  const token = authHeader && authHeader.split(' ')[1];
  console.log('Token:', token);

  if (!token) {
    console.log('No token provided');
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    console.log('JWT Secret:', JWT_SECRET);
    const user = jwt.verify(token, JWT_SECRET) as {
      userId: number;
      wallet_address: string;
      team_id?: number;
    };
    console.log('Verified user:', user);
    (req as AuthRequest).user = user;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};
