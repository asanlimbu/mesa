import { Router } from 'express';

import * as authService from '../services/auth.service.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

export const authRoutes = Router();

authRoutes.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body ?? {};
    const result = await authService.register({ name, email, password, role });
    res.status(201).json(result);
  }),
);

authRoutes.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    const result = await authService.login({ email, password });
    res.json(result);
  }),
);

authRoutes.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);
