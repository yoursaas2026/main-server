import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { db } from './db/index.js';
import { sql } from 'drizzle-orm';
import { env } from './config/env.js';
import adminAuthRoutes from './routes/admin/auth.routes.js';
import adminDeveloperRoutes from './routes/admin/developer.routes.js';
import adminProductRoutes from './routes/admin/product.routes.js';
import developerAuthRoutes from './routes/developer/auth.routes.js';
import developerKycRoutes from './routes/developer/kyc.routes.js';
import developerPaymentRoutes from './routes/developer/payment.routes.js';
import developerChatRoutes from './routes/developer/chat.routes.js';
import developerProductRoutes from './routes/developer/product.routes.js';
import { developerProfileRoutes } from './routes/developer/profile.routes.js';
import publicProductRoutes from './routes/public/product.routes.js';
import userAuthRoutes from './routes/user/auth.routes.js';
import userChatRoutes from './routes/user/chat.routes.js';
const app = new Hono();
// Middleware
app.use('*', logger());
app.use('*', cors({
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
}));
// Static files
app.use('/public/*', serveStatic({ root: './' }));
app.use('/uploads/*', serveStatic({ root: './' }));
// Health check
app.get('/', async (c) => {
    try {
        const tables = await db.execute(sql `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
        return c.json({
            message: 'YourSaaS API Server',
            version: '1.0.0',
            status: 'healthy',
            databaseStatus: 'Connected ✅',
            tablesInDatabase: tables,
            endpoints: {
                auth: '/api/developer/auth',
                developerProducts: '/api/developer/products',
                userAuth: '/api/user/auth',
                userChat: '/api/user/chat',
                developerChat: '/api/developer/chat',
                health: '/',
            },
        });
    }
    catch (err) {
        return c.json({
            message: 'YourSaaS API Server',
            status: 'unhealthy',
            error: 'Database connection failed',
            details: err instanceof Error ? err.message : String(err),
        }, 500);
    }
});
// API Routes
app.route('/api/admin/auth', adminAuthRoutes);
app.route('/api/admin/developers', adminDeveloperRoutes);
app.route('/api/admin/products', adminProductRoutes);
app.route('/api/developer/auth', developerAuthRoutes);
app.route('/api/developer/kyc', developerKycRoutes);
app.route('/api/developer/payment', developerPaymentRoutes);
app.route('/api/developer/products', developerProductRoutes);
app.route('/api/developer/profile', developerProfileRoutes);
app.route('/api/developer/chat', developerChatRoutes);
app.route('/api/public/products', publicProductRoutes);
app.route('/api/user/auth', userAuthRoutes);
app.route('/api/user/chat', userChatRoutes);
// 404 handler
app.notFound((c) => {
    return c.json({
        error: 'Not Found',
        message: 'The requested endpoint does not exist',
        path: c.req.path,
    }, 404);
});
// Error handler
app.onError((err, c) => {
    console.error('Server error:', err);
    return c.json({
        error: 'Internal Server Error',
        message: err.message || 'An unexpected error occurred',
    }, 500);
});
const port = env.PORT;
console.log(`
🚀 YourSaaS API Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Server running on: http://localhost:${port}
🌍 Environment: ${env.NODE_ENV}
🔐 Authentication: Enabled
  - Email/Password: ✅
  - Google OAuth: ${env.GOOGLE_CLIENT_ID ? '✅' : '❌'}
  - Microsoft OAuth: ${env.MICROSOFT_CLIENT_ID ? '✅' : '❌'}
  - Apple OAuth: ${env.APPLE_CLIENT_ID ? '✅' : '❌'}
📧 Email Service: ${env.BREVO_API_KEY ? '✅ Brevo' : '❌'}
💬 Stream Chat: ${env.STREAM_API_KEY && env.STREAM_API_SECRET ? '✅' : '❌ (set STREAM_API_KEY + STREAM_API_SECRET)'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
serve({
    fetch: app.fetch,
    port,
});
export default app;
