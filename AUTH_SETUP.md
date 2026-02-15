# Authentication System Documentation

## Overview
This authentication system provides comprehensive support for email/password authentication and OAuth integration with Google, Microsoft, and Apple.

## Features
- ✅ Email/Password Registration & Login
- ✅ Google OAuth 2.0
- ✅ Microsoft OAuth 2.0
- ✅ Apple Sign In
- ✅ Password Reset via Email
- ✅ JWT Token Authentication
- ✅ Email Verification
- ✅ Brevo Transactional Email Integration
- ✅ CORS Support
- ✅ Modular Architecture

## Directory Structure

```
src/
├── config/
│   └── env.ts              # Environment configuration
├── controllers/
│   └── auth.controller.ts  # Authentication business logic
├── middleware/
│   └── auth.middleware.ts  # JWT authentication middleware
├── routes/
│   └── auth.routes.ts      # Authentication routes
├── services/
│   ├── email.service.ts    # Brevo email service
│   └── oauth.service.ts    # OAuth provider services
├── utils/
│   ├── jwt.ts             # JWT utilities
│   └── password.ts        # Password utilities
├── db/
│   ├── index.ts           # Database connection
│   └── schema.ts          # Database schema
└── index.ts               # Main app entry
```

## API Endpoints

### Email/Password Authentication

#### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123",
  "phone": "+1234567890" (optional)
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

#### Forgot Password
```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "john@example.com"
}
```

#### Reset Password
```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "reset-token-from-email",
  "newPassword": "newsecurepassword123"
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <jwt-token>
```

### OAuth Authentication

#### Google OAuth
1. **Initiate:** `GET /api/auth/google`
2. **Callback:** `GET /api/auth/google/callback?code=<auth-code>`

#### Microsoft OAuth
1. **Initiate:** `GET /api/auth/microsoft`
2. **Callback:** `GET /api/auth/microsoft/callback?code=<auth-code>`

#### Apple OAuth
1. **Initiate:** `GET /api/auth/apple`
2. **Callback:** `POST /api/auth/apple/callback` (Form POST)

## Environment Variables Setup

Copy `.env.example` to `.env` and configure the following:

### Required Variables
```env
DATABASE_URL="postgresql://user:password@host:port/database"
JWT_SECRET="your-random-secret-key"
BREVO_API_KEY="your-brevo-api-key"
```

### Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Go to Credentials → Create OAuth 2.0 Client ID
5. Set authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
6. Copy Client ID and Secret to `.env`

```env
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
```

### Microsoft OAuth Setup
1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to Azure Active Directory → App registrations
3. Register a new application
4. Add redirect URI: `http://localhost:3000/api/auth/microsoft/callback`
5. Create a client secret
6. Copy Application (client) ID and secret to `.env`

```env
MICROSOFT_CLIENT_ID="your-application-id"
MICROSOFT_CLIENT_SECRET="your-client-secret"
```

### Apple OAuth Setup
1. Go to [Apple Developer](https://developer.apple.com/)
2. Create an App ID with Sign In with Apple enabled
3. Create a Service ID
4. Configure return URLs: `http://localhost:3000/api/auth/apple/callback`
5. Create a private key for Sign In with Apple
6. Copy credentials to `.env`

```env
APPLE_CLIENT_ID="your.service.identifier"
APPLE_TEAM_ID="your-team-id"
APPLE_KEY_ID="your-key-id"
APPLE_PRIVATE_KEY="your-private-key-content"
```

### Brevo Email Setup
1. Sign up at [Brevo](https://www.brevo.com/)
2. Go to SMTP & API → API Keys
3. Create a new API key
4. Copy to `.env`

```env
BREVO_API_KEY="xkeysib-xxxxx"
BREVO_SENDER_EMAIL="noreply@yourdomain.com"
BREVO_SENDER_NAME="YourSaaS"
```

## Email Templates

The system includes the following email templates:

1. **Welcome Email** - Sent on registration
2. **Password Reset Email** - Sent on password reset request
3. **Email Verification** - Sent for email verification
4. **Login Notification** - Sent on new login (optional)

All templates are customizable in `src/services/email.service.ts`

## Database Schema

The `developers` table includes:
- Email/Password fields
- OAuth provider IDs (Google, Microsoft, Apple)
- Auth provider tracking
- Email/phone verification status
- Profile information
- KYC fields
- Timestamps

## Security Features

- ✅ Password hashing with bcrypt (10 rounds)
- ✅ JWT token expiration
- ✅ Password reset token expiration (1 hour)
- ✅ CORS protection
- ✅ OAuth state validation
- ✅ Input validation
- ✅ SQL injection protection (via Drizzle ORM)

## Usage Examples

### Frontend Integration

```javascript
// Login with email/password
const response = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const { token, user } = await response.json();
localStorage.setItem('token', token);

// OAuth Login (redirect user)
window.location.href = 'http://localhost:3000/api/auth/google';

// Make authenticated request
const userResponse = await fetch('http://localhost:3000/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

## Testing

Use the following test endpoints:

```bash
# Health check
curl http://localhost:3000/

# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check DATABASE_URL is correct
   - Ensure PostgreSQL is running
   - Verify database exists

2. **OAuth Redirect Mismatch**
   - Ensure callback URLs match exactly in provider console
   - Check FRONTEND_URL is correct

3. **Email Not Sending**
   - Verify BREVO_API_KEY is valid
   - Check sender email is verified in Brevo
   - Review Brevo dashboard for errors

4. **CORS Errors**
   - Update CORS_ORIGIN with your frontend URL
   - Ensure frontend sends credentials: true

## Production Deployment

Before deploying to production:

1. ✅ Change JWT_SECRET to a strong random value
2. ✅ Update all callback URLs to production URLs
3. ✅ Enable HTTPS (required for Apple Sign In)
4. ✅ Set NODE_ENV=production
5. ✅ Configure proper CORS origins
6. ✅ Enable rate limiting
7. ✅ Set up monitoring and logging
8. ✅ Configure database backups

## Support

For issues or questions:
- Check the troubleshooting section
- Review the code comments
- Test with the provided examples

## License

MIT
