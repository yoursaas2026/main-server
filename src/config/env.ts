import { config } from 'dotenv';

config();

export const env = {
    // Database
    DATABASE_URL: process.env.DATABASE_URL || '',

    // Server
    PORT: parseInt(process.env.PORT || '3000'),
    NODE_ENV: process.env.NODE_ENV || 'development',

    // JWT
    JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

    // OAuth - Google
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
    DEVELOPER_GOOGLE_CALLBACK_URL: process.env.DEVELOPER_GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/developer/auth/google/callback',
    USER_GOOGLE_CALLBACK_URL: process.env.USER_GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/user/auth/google/callback',
    ADMIN_GOOGLE_CALLBACK_URL: process.env.ADMIN_GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/admin/auth/google/callback',

    // OAuth - Microsoft
    MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID || '',
    MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET || '',
    DEVELOPER_MICROSOFT_CALLBACK_URL: process.env.DEVELOPER_MICROSOFT_CALLBACK_URL || 'http://localhost:3000/api/developer/auth/microsoft/callback',
    USER_MICROSOFT_CALLBACK_URL: process.env.USER_MICROSOFT_CALLBACK_URL || 'http://localhost:3000/api/user/auth/microsoft/callback',

    // OAuth - Apple
    APPLE_CLIENT_ID: process.env.APPLE_CLIENT_ID || '',
    APPLE_TEAM_ID: process.env.APPLE_TEAM_ID || '',
    APPLE_KEY_ID: process.env.APPLE_KEY_ID || '',
    APPLE_PRIVATE_KEY: process.env.APPLE_PRIVATE_KEY || '',
    APPLE_CALLBACK_URL: process.env.APPLE_CALLBACK_URL || 'http://localhost:3000/api/auth/apple/callback',

    // Email - Brevo
    BREVO_API_KEY: process.env.BREVO_API_KEY || '',
    BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL || 'noreply@yoursaas.com',
    BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME || 'YourSaaS',

    // Frontend URLs
    DEVELOPER_PORTAL_URL: process.env.DEVELOPER_PORTAL_URL || 'http://localhost:3001',
    USER_PORTAL_URL: process.env.USER_PORTAL_URL || 'http://localhost:3002',
    ADMIN_PORTAL_URL: process.env.ADMIN_PORTAL_URL || 'http://localhost:3003',

    // Security
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3001,http://localhost:3002',
};
