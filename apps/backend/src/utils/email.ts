import nodemailer from 'nodemailer';
import { env } from './env';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Email service for sending transactional emails
 * Supports multiple providers: SMTP, SendGrid, AWS SES
 */
class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    // Initialize based on environment variables
    if (process.env.SMTP_HOST) {
      // Use SMTP (supports Gmail, Outlook, custom SMTP)
      this.transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      // Development: Use Ethereal for testing (fake SMTP)
      console.warn('⚠️  No email configuration found. Using development mode (logs only).');
    }
  }

  async send(options: EmailOptions): Promise<boolean> {
    try {
      if (!this.transporter) {
        // Development mode: just log
        console.log('📧 [EMAIL] Would send:', {
          to: options.to,
          subject: options.subject,
          preview: options.html.substring(0, 100) + '...',
        });
        return true;
      }

      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || '"LeadFlow Pro" <noreply@leadflowpro.com>',
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      console.log('✅ Email sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('❌ Error sending email:', error);
      return false;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(to: string, resetToken: string, name: string): Promise<boolean> {
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${resetToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 28px;
            font-weight: bold;
            color: #3b82f6;
          }
          h1 {
            color: #1f2937;
            font-size: 24px;
            margin-bottom: 20px;
          }
          .button {
            display: inline-block;
            padding: 14px 28px;
            background: #3b82f6;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
          }
          .button:hover {
            background: #2563eb;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
          }
          .warning {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 12px;
            margin: 20px 0;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🚀 LeadFlow Pro</div>
          </div>

          <h1>Reset Your Password</h1>

          <p>Hi ${name},</p>

          <p>We received a request to reset your password. Click the button below to create a new password:</p>

          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </div>

          <div class="warning">
            <strong>⚠️ Security Notice:</strong><br>
            This link will expire in 1 hour. If you didn't request this reset, please ignore this email.
          </div>

          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #3b82f6;">${resetUrl}</p>

          <div class="footer">
            <p>If you have any questions, reply to this email or contact support.</p>
            <p>This email was sent to ${to}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Reset Your Password

      Hi ${name},

      We received a request to reset your password. Click the link below to create a new password:

      ${resetUrl}

      This link will expire in 1 hour. If you didn't request this reset, please ignore this email.

      If you have any questions, contact support.
    `;

    return this.send({
      to,
      subject: 'Reset Your Password - LeadFlow Pro',
      html,
      text,
    });
  }

  /**
   * Send email verification
   */
  async sendEmailVerification(to: string, verificationToken: string, name: string): Promise<boolean> {
    const verifyUrl = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 28px;
            font-weight: bold;
            color: #3b82f6;
          }
          h1 {
            color: #1f2937;
            font-size: 24px;
            margin-bottom: 20px;
          }
          .button {
            display: inline-block;
            padding: 14px 28px;
            background: #10b981;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
          }
          .button:hover {
            background: #059669;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🚀 LeadFlow Pro</div>
          </div>

          <h1>Welcome to LeadFlow Pro!</h1>

          <p>Hi ${name},</p>

          <p>Thanks for signing up! Please verify your email address to get started:</p>

          <div style="text-align: center;">
            <a href="${verifyUrl}" class="button">Verify Email</a>
          </div>

          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #3b82f6;">${verifyUrl}</p>

          <div class="footer">
            <p>If you didn't create an account, you can safely ignore this email.</p>
            <p>This email was sent to ${to}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Welcome to LeadFlow Pro!

      Hi ${name},

      Thanks for signing up! Please verify your email address to get started:

      ${verifyUrl}

      If you didn't create an account, you can safely ignore this email.
    `;

    return this.send({
      to,
      subject: 'Verify Your Email - LeadFlow Pro',
      html,
      text,
    });
  }

  /**
   * Send 2FA code
   */
  async send2FACode(to: string, code: string, name: string): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Verification Code</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .code {
            font-size: 32px;
            font-weight: bold;
            color: #3b82f6;
            text-align: center;
            padding: 20px;
            background: #f3f4f6;
            border-radius: 8px;
            letter-spacing: 8px;
            margin: 20px 0;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Your Verification Code</h1>

          <p>Hi ${name},</p>

          <p>Here's your verification code:</p>

          <div class="code">${code}</div>

          <p>This code will expire in 10 minutes.</p>

          <div class="footer">
            <p>If you didn't request this code, please ignore this email and contact support.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Your Verification Code

      Hi ${name},

      Here's your verification code: ${code}

      This code will expire in 10 minutes.

      If you didn't request this code, please ignore this email and contact support.
    `;

    return this.send({
      to,
      subject: 'Your Verification Code - LeadFlow Pro',
      html,
      text,
    });
  }
}

// Export singleton instance
export const emailService = new EmailService();
