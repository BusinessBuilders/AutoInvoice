import { google } from 'googleapis';
import { oauth2Client } from './client';
import logger from '../../utils/logger';
import { prisma } from '../../utils/db';

/**
 * Gmail Service - Production-Ready Email Sending
 * Supports HTML templates, attachments, and tracking
 */

export interface EmailOptions {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string; // HTML content
  attachments?: Array<{
    filename: string;
    content: Buffer;
    mimeType: string;
  }>;
  replyTo?: string;
}

/**
 * Send email via Gmail API
 */
export async function sendEmail(options: EmailOptions): Promise<{ messageId: string; threadId: string }> {
  if (!oauth2Client) {
    throw new Error('Google OAuth2 not configured');
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  try {
    // Construct email message
    const email = createEmailMessage(options);

    // Send email
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: email,
      },
    });

    logger.info('Email sent via Gmail', {
      to: options.to,
      subject: options.subject,
      messageId: response.data.id,
    });

    return {
      messageId: response.data.id!,
      threadId: response.data.threadId!,
    };
  } catch (error: any) {
    logger.error('Gmail send error:', {
      error: error.message,
      to: options.to,
      subject: options.subject,
    });
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Send invoice email with PDF attachment
 */
export async function sendInvoiceEmail(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      lineItems: true,
    },
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  if (!invoice.customer.email) {
    throw new Error(`Customer ${invoice.customer.name} has no email address`);
  }

  // Get PDF (should be generated already)
  if (!invoice.pdfData) {
    throw new Error(`Invoice ${invoice.invoiceNumber} has no PDF data`);
  }

  // Create email body
  const emailBody = createInvoiceEmailTemplate(invoice);

  // Send email with PDF attachment
  await sendEmail({
    to: invoice.customer.email,
    subject: `Invoice ${invoice.invoiceNumber} from AutoInvoice`,
    body: emailBody,
    attachments: [
      {
        filename: `Invoice-${invoice.invoiceNumber}.pdf`,
        content: invoice.pdfData,
        mimeType: 'application/pdf',
      },
    ],
  });

  // Update invoice status
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: 'SENT',
      sentAt: new Date(),
    },
  });

  logger.info('Invoice email sent', {
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customer.id,
    customerEmail: invoice.customer.email,
  });
}

/**
 * Create email message in RFC 2822 format
 */
function createEmailMessage(options: EmailOptions): string {
  const boundary = '----=_Part_' + Date.now();

  let message = '';

  // Headers
  message += `To: ${options.to}\r\n`;
  if (options.cc && options.cc.length > 0) {
    message += `Cc: ${options.cc.join(', ')}\r\n`;
  }
  if (options.bcc && options.bcc.length > 0) {
    message += `Bcc: ${options.bcc.join(', ')}\r\n`;
  }
  if (options.replyTo) {
    message += `Reply-To: ${options.replyTo}\r\n`;
  }
  message += `Subject: ${options.subject}\r\n`;
  message += `MIME-Version: 1.0\r\n`;
  message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

  // HTML Body
  message += `--${boundary}\r\n`;
  message += `Content-Type: text/html; charset="UTF-8"\r\n`;
  message += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
  message += `${options.body}\r\n\r\n`;

  // Attachments
  if (options.attachments && options.attachments.length > 0) {
    for (const attachment of options.attachments) {
      message += `--${boundary}\r\n`;
      message += `Content-Type: ${attachment.mimeType}\r\n`;
      message += `Content-Transfer-Encoding: base64\r\n`;
      message += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n\r\n`;
      message += attachment.content.toString('base64') + '\r\n\r\n';
    }
  }

  message += `--${boundary}--`;

  // Base64 encode the entire message
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Create HTML email template for invoice
 */
function createInvoiceEmailTemplate(invoice: any): string {
  const lineItemsHtml = invoice.lineItems
    .map(
      (item: any) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.description}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${item.rate.toFixed(2)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">$${item.amount.toFixed(2)}</td>
    </tr>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoiceNumber}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

  <!-- Header -->
  <div style="text-align: center; margin-bottom: 40px;">
    <h1 style="color: #2563eb; margin-bottom: 8px;">AutoInvoice</h1>
    <p style="color: #6b7280; margin: 0;">Professional Invoicing Made Simple</p>
  </div>

  <!-- Invoice Header -->
  <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0 0 8px 0;">Invoice ${invoice.invoiceNumber}</h2>
    <p style="margin: 0; opacity: 0.9;">Issued: ${invoice.issueDate.toLocaleDateString()}</p>
  </div>

  <!-- Main Content -->
  <div style="background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; padding: 30px;">

    <!-- Customer Info -->
    <div style="margin-bottom: 30px;">
      <h3 style="color: #374151; margin-bottom: 12px;">Bill To:</h3>
      <p style="margin: 0; font-weight: 600;">${invoice.customer.name}</p>
      ${invoice.customer.email ? `<p style="margin: 4px 0; color: #6b7280;">${invoice.customer.email}</p>` : ''}
      ${invoice.customer.phone ? `<p style="margin: 4px 0; color: #6b7280;">${invoice.customer.phone}</p>` : ''}
    </div>

    <!-- Invoice Details -->
    <div style="display: flex; justify-content: space-between; margin-bottom: 30px; padding: 20px; background: #f9fafb; border-radius: 6px;">
      <div>
        <p style="margin: 0; color: #6b7280; font-size: 14px;">Service Date</p>
        <p style="margin: 4px 0; font-weight: 600;">${invoice.serviceDate.toLocaleDateString()}</p>
      </div>
      <div style="text-align: right;">
        <p style="margin: 0; color: #6b7280; font-size: 14px;">Due Date</p>
        <p style="margin: 4px 0; font-weight: 600;">${invoice.dueDate.toLocaleDateString()}</p>
      </div>
    </div>

    <!-- Line Items -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
      <thead>
        <tr style="background: #f9fafb;">
          <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; color: #374151; font-weight: 600;">Description</th>
          <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb; color: #374151; font-weight: 600;">Qty</th>
          <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb; color: #374151; font-weight: 600;">Rate</th>
          <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb; color: #374151; font-weight: 600;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
      </tbody>
    </table>

    <!-- Totals -->
    <div style="text-align: right; margin-bottom: 30px;">
      <div style="margin-bottom: 8px;">
        <span style="color: #6b7280;">Subtotal:</span>
        <span style="font-weight: 600; margin-left: 20px;">$${invoice.subtotal.toFixed(2)}</span>
      </div>
      ${invoice.taxAmount > 0 ? `
      <div style="margin-bottom: 8px;">
        <span style="color: #6b7280;">Tax (${invoice.taxRate}%):</span>
        <span style="font-weight: 600; margin-left: 20px;">$${invoice.taxAmount.toFixed(2)}</span>
      </div>
      ` : ''}
      ${invoice.discount > 0 ? `
      <div style="margin-bottom: 8px;">
        <span style="color: #6b7280;">Discount:</span>
        <span style="font-weight: 600; margin-left: 20px; color: #22c55e;">-$${invoice.discount.toFixed(2)}</span>
      </div>
      ` : ''}
      <div style="margin-top: 12px; padding-top: 12px; border-top: 2px solid #e5e7eb;">
        <span style="font-size: 18px; font-weight: 700; color: #111827;">Total:</span>
        <span style="font-size: 24px; font-weight: 700; color: #2563eb; margin-left: 20px;">$${invoice.total.toFixed(2)}</span>
      </div>
    </div>

    ${invoice.notes ? `
    <!-- Notes -->
    <div style="padding: 20px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; margin-bottom: 30px;">
      <h4 style="margin: 0 0 8px 0; color: #92400e;">Notes:</h4>
      <p style="margin: 0; color: #78350f;">${invoice.notes}</p>
    </div>
    ` : ''}

    <!-- Payment Instructions -->
    <div style="background: #f0f9ff; padding: 20px; border-radius: 6px; border-left: 4px solid #2563eb;">
      <h4 style="margin: 0 0 12px 0; color: #1e40af;">Payment Instructions</h4>
      <p style="margin: 0 0 8px 0; color: #1e3a8a;">Please make payment by ${invoice.dueDate.toLocaleDateString()}</p>
      <p style="margin: 0; color: #3b82f6; font-weight: 600;">Questions? Reply to this email!</p>
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
    <p style="color: #6b7280; margin: 0 0 8px 0; font-size: 14px;">Thank you for your business!</p>
    <p style="color: #9ca3af; margin: 0; font-size: 12px;">This is an automated email from AutoInvoice</p>
  </div>

</body>
</html>
  `;
}

/**
 * Send payment reminder email
 */
export async function sendPaymentReminder(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
    },
  });

  if (!invoice || !invoice.customer.email) {
    return;
  }

  const daysOverdue = Math.ceil(
    (Date.now() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const emailBody = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
  <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; border-radius: 4px;">
    <h2 style="color: #991b1b; margin-top: 0;">Payment Reminder</h2>
    <p>Hello ${invoice.customer.name},</p>
    <p>This is a friendly reminder that invoice <strong>${invoice.invoiceNumber}</strong> for <strong>$${invoice.total.toFixed(2)}</strong> is now ${daysOverdue} days overdue.</p>
    <p>Original due date: <strong>${invoice.dueDate.toLocaleDateString()}</strong></p>
    <p>If you've already sent payment, please disregard this message. Otherwise, please submit payment at your earliest convenience.</p>
    <p>If you have any questions or concerns, please don't hesitate to reach out.</p>
    <p>Thank you!</p>
  </div>
</body>
</html>
  `;

  await sendEmail({
    to: invoice.customer.email,
    subject: `Payment Reminder: Invoice ${invoice.invoiceNumber} (${daysOverdue} days overdue)`,
    body: emailBody,
  });

  logger.info('Payment reminder sent', {
    invoiceNumber: invoice.invoiceNumber,
    daysOverdue,
    customerEmail: invoice.customer.email,
  });
}
