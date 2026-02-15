import { Hono } from 'hono';
import { authController } from '../../controllers/developer/auth.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

const authRoutes = new Hono();

// Email/Password Authentication
authRoutes.post('/register', (c) => authController.register(c));
authRoutes.post('/login', (c) => authController.login(c));

// Password Reset
authRoutes.post('/forgot-password', (c) => authController.forgotPassword(c));
authRoutes.post('/reset-password', (c) => authController.resetPassword(c));

// Google OAuth
authRoutes.get('/google', (c) => authController.googleAuth(c));
authRoutes.get('/google/callback', (c) => authController.googleCallback(c));

// Microsoft OAuth
authRoutes.get('/microsoft', (c) => authController.microsoftAuth(c));
authRoutes.get('/microsoft/callback', (c) => authController.microsoftCallback(c));

// Apple OAuth
authRoutes.get('/apple', (c) => authController.appleAuth(c));
authRoutes.post('/apple/callback', (c) => authController.appleCallback(c)); // Apple uses POST

// Protected Routes
authRoutes.get('/me', authMiddleware, (c) => authController.getCurrentUser(c));

export default authRoutes;
