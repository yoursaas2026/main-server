import axios from 'axios';
import { env } from '../config/env.js';
class OAuthService {
    // Google OAuth
    async getGoogleAuthUrl(redirectUri = env.DEVELOPER_GOOGLE_CALLBACK_URL) {
        const params = new URLSearchParams({
            client_id: env.GOOGLE_CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'openid email profile',
            access_type: 'offline',
            prompt: 'consent',
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }
    async getGoogleUserInfo(code, redirectUri = env.DEVELOPER_GOOGLE_CALLBACK_URL) {
        try {
            // Exchange code for access token
            const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
                code,
                client_id: env.GOOGLE_CLIENT_ID,
                client_secret: env.GOOGLE_CLIENT_SECRET,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            });
            const { access_token } = tokenResponse.data;
            // Get user info
            const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: {
                    Authorization: `Bearer ${access_token}`,
                },
            });
            const userInfo = userResponse.data;
            return {
                provider: 'google',
                providerId: userInfo.id,
                email: userInfo.email,
                name: userInfo.name,
                picture: userInfo.picture,
                emailVerified: userInfo.verified_email,
            };
        }
        catch (error) {
            console.error('Google OAuth error:', error);
            throw new Error('Failed to authenticate with Google');
        }
    }
    // Microsoft OAuth
    async getMicrosoftAuthUrl(redirectUri = env.DEVELOPER_MICROSOFT_CALLBACK_URL) {
        const params = new URLSearchParams({
            client_id: env.MICROSOFT_CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'openid email profile User.Read',
            response_mode: 'query',
        });
        return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
    }
    async getMicrosoftUserInfo(code, redirectUri = env.DEVELOPER_MICROSOFT_CALLBACK_URL) {
        try {
            // Exchange code for access token
            const tokenResponse = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', new URLSearchParams({
                client_id: env.MICROSOFT_CLIENT_ID,
                client_secret: env.MICROSOFT_CLIENT_SECRET,
                code,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });
            const { access_token } = tokenResponse.data;
            // Get user info
            const userResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
                headers: {
                    Authorization: `Bearer ${access_token}`,
                },
            });
            const userInfo = userResponse.data;
            return {
                provider: 'microsoft',
                providerId: userInfo.id,
                email: userInfo.mail || userInfo.userPrincipalName,
                name: userInfo.displayName,
                emailVerified: true, // Microsoft emails are always verified
            };
        }
        catch (error) {
            console.error('Microsoft OAuth error:', error);
            throw new Error('Failed to authenticate with Microsoft');
        }
    }
    // Apple OAuth
    async getAppleAuthUrl(redirectUri = env.APPLE_CALLBACK_URL) {
        const params = new URLSearchParams({
            client_id: env.APPLE_CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'email name',
            response_mode: 'form_post',
        });
        return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
    }
    async getAppleUserInfo(code, idToken) {
        try {
            // For Apple, the id_token contains user info
            // In production, you would verify the JWT token here
            if (idToken) {
                // Decode the JWT (in production, use proper JWT verification)
                const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
                return {
                    provider: 'apple',
                    providerId: payload.sub,
                    email: payload.email,
                    name: payload.email.split('@')[0], // Apple doesn't always provide name
                    emailVerified: payload.email_verified === 'true',
                };
            }
            throw new Error('No ID token provided');
        }
        catch (error) {
            console.error('Apple OAuth error:', error);
            throw new Error('Failed to authenticate with Apple');
        }
    }
}
export const oauthService = new OAuthService();
