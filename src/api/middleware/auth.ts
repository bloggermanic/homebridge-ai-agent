import { Request, Response, NextFunction } from 'express';

export function createAuthMiddleware(apiToken?: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!apiToken) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.substring(7);
    if (token !== apiToken) {
      res.status(403).json({ error: 'Invalid token' });
      return;
    }

    next();
  };
}

export function validateWsToken(token: string | undefined, apiToken?: string): boolean {
  if (!apiToken) return true;
  return token === apiToken;
}
