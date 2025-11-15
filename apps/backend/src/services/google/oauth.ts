import { google } from 'googleapis';
import { oauth2Client } from './client';
import logger from '../../utils/logger';
import { env } from '../../utils/env';

/**
 * Google OAuth 2.0 Authentication Flow
 * Production-ready OAuth implementation
 */

// Scopes required for AutoInvoice
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',          // Send emails
  'https://www.googleapis.com/auth/gmail.compose',       // Compose emails
  'https://www.googleapis.com/auth/calendar',            // Full calendar access
  'https://www.googleapis.com/auth/drive.file',          // Create and access own files
  'https://www.googleapis.com/auth/drive.appdata',       // App-specific data
  'https://www.googleapis.com/auth/userinfo.email',      // User email
  'https://www.googleapis.com/auth/userinfo.profile',    // User profile
];

/**
 * Generate OAuth authorization URL
 */
export function getAuthUrl(): string {
  if (!oauth2Client) {
    throw new Error('Google OAuth2 not configured');
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',  // Get refresh token
    scope: SCOPES,
    prompt: 'consent',       // Force consent screen to get refresh token
  });

  logger.info('OAuth authorization URL generated');

  return authUrl;
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expiry_date: number;
}> {
  if (!oauth2Client) {
    throw new Error('Google OAuth2 not configured');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    // Set credentials on the client
    oauth2Client.setCredentials(tokens);

    logger.info('OAuth tokens obtained', {
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
    });

    return {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date!,
    };
  } catch (error: any) {
    logger.error('OAuth token exchange error:', error);
    throw new Error(`Failed to exchange code for tokens: ${error.message}`);
  }
}

/**
 * Set tokens on OAuth client
 */
export function setTokens(tokens: {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
}): void {
  if (!oauth2Client) {
    throw new Error('Google OAuth2 not configured');
  }

  oauth2Client.setCredentials(tokens);

  logger.info('OAuth tokens set on client', {
    hasRefreshToken: !!tokens.refresh_token,
  });
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(): Promise<{
  access_token: string;
  expiry_date: number;
}> {
  if (!oauth2Client) {
    throw new Error('Google OAuth2 not configured');
  }

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();

    oauth2Client.setCredentials(credentials);

    logger.info('Access token refreshed', {
      expiryDate: credentials.expiry_date,
    });

    return {
      access_token: credentials.access_token!,
      expiry_date: credentials.expiry_date!,
    };
  } catch (error: any) {
    logger.error('Token refresh error:', error);
    throw new Error(`Failed to refresh access token: ${error.message}`);
  }
}

/**
 * Revoke access (disconnect)
 */
export async function revokeAccess(): Promise<void> {
  if (!oauth2Client) {
    throw new Error('Google OAuth2 not configured');
  }

  try {
    await oauth2Client.revokeCredentials();

    logger.info('OAuth access revoked');
  } catch (error: any) {
    logger.error('Token revocation error:', error);
    throw new Error(`Failed to revoke access: ${error.message}`);
  }
}

/**
 * Get user info from Google
 */
export async function getUserInfo(): Promise<{
  email: string;
  name: string;
  picture?: string;
}> {
  if (!oauth2Client) {
    throw new Error('Google OAuth2 not configured');
  }

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });

  try {
    const response = await oauth2.userinfo.get();

    return {
      email: response.data.email!,
      name: response.data.name!,
      picture: response.data.picture,
    };
  } catch (error: any) {
    logger.error('User info fetch error:', error);
    throw new Error(`Failed to get user info: ${error.message}`);
  }
}

/**
 * Check if tokens are set and valid
 */
export function hasValidTokens(): boolean {
  if (!oauth2Client) {
    return false;
  }

  const credentials = oauth2Client.credentials;

  if (!credentials || !credentials.access_token) {
    return false;
  }

  // Check if token is expired
  if (credentials.expiry_date && credentials.expiry_date < Date.now()) {
    return false;
  }

  return true;
}

/**
 * Express route handlers for OAuth flow
 */
export const oauthHandlers = {
  /**
   * GET /auth/google - Redirect to Google OAuth
   */
  initiateAuth: (req: any, res: any) => {
    try {
      const authUrl = getAuthUrl();
      res.redirect(authUrl);
    } catch (error: any) {
      logger.error('Auth initiation error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /auth/google/callback - Handle OAuth callback
   */
  handleCallback: async (req: any, res: any) => {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'No authorization code provided' });
    }

    try {
      const tokens = await getTokensFromCode(code);

      // TODO: Store tokens securely in database
      // For now, just return success

      res.send(`
        <html>
          <head><title>Authorization Successful</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>✅ Authorization Successful!</h1>
            <p>You can close this window and return to AutoInvoice.</p>
            <p>Google Workspace integration is now active.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      logger.error('OAuth callback error:', error);
      res.status(500).send(`
        <html>
          <head><title>Authorization Failed</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>❌ Authorization Failed</h1>
            <p>${error.message}</p>
            <p><a href="/auth/google">Try again</a></p>
          </body>
        </html>
      `);
    }
  },

  /**
   * POST /auth/google/revoke - Revoke access
   */
  revokeAccess: async (req: any, res: any) => {
    try {
      await revokeAccess();
      res.json({ success: true, message: 'Access revoked successfully' });
    } catch (error: any) {
      logger.error('Revoke access error:', error);
      res.status(500).json({ error: error.message });
    }
  },
};
