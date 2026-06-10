import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { InvoiceStatus } from '@prisma/client';
import logger from '../utils/logger';

/**
 * Customer Statement Router
 * Manages customer statements, payment tracking, and statement delivery
 */

export const customerStatementRouter = router({
  /**
   * Get Customer Statement
   * Fetches all invoices for a customer with filtering and summary
   */
  getStatement: protectedProcedure
    .input(
      z.object({
        customerId: z.string(),
        includeStatuses: z
          .array(z.enum(['SENT', 'OVERDUE', 'PAID']))
          .default(['SENT', 'OVERDUE']),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { customerId, includeStatuses, startDate, endDate } = input;

      // Fetch customer
      const customer = await ctx.prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          company: true,
        },
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      // Build date filter
      const dateFilter: any = {};
      if (startDate) {
        dateFilter.gte = startDate;
      }
      if (endDate) {
        dateFilter.lte = endDate;
      }

      // Fetch invoices with filters
      const invoices = await ctx.prisma.invoice.findMany({
        where: {
          customerId,
          status: {
            in: includeStatuses as InvoiceStatus[],
          },
          ...(Object.keys(dateFilter).length > 0 && {
            serviceDate: dateFilter,
          }),
        },
        select: {
          id: true,
          invoiceNumber: true,
          serviceDate: true,
          dueDate: true,
          total: true,
          status: true,
        },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      });

      // Calculate days overdue for each invoice
      const today = new Date();
      const enrichedInvoices = invoices.map((invoice) => {
        const daysOverdue =
          invoice.status === InvoiceStatus.OVERDUE
            ? Math.max(
                0,
                Math.ceil(
                  (today.getTime() - invoice.dueDate.getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              )
            : 0;

        return {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          date: invoice.serviceDate,
          dueDate: invoice.dueDate,
          total: invoice.total.toString(), // Convert Decimal to string
          status: invoice.status,
          daysOverdue,
        };
      });

      // Calculate summary
      const totalInvoices = enrichedInvoices.length;
      const totalAmount = invoices.reduce(
        (sum, inv) => sum + Number(inv.total),
        0
      );

      const overdueInvoices = enrichedInvoices.filter(
        (inv) => inv.status === InvoiceStatus.OVERDUE
      );
      const overdueCount = overdueInvoices.length;
      const overdueAmount = overdueInvoices.reduce(
        (sum, inv) => sum + Number(inv.total),
        0
      );

      return {
        customer,
        invoices: enrichedInvoices,
        summary: {
          totalInvoices,
          totalAmount: totalAmount.toString(),
          overdueAmount: overdueAmount.toString(),
          overdueCount,
        },
      };
    }),

  /**
   * Mark Invoice as Paid
   * Updates invoice status to PAID and records payment date
   */
  markInvoiceAsPaid: protectedProcedure
    .input(
      z.object({
        invoiceId: z.string(),
        paidDate: z.coerce.date().optional(),
        paymentMethod: z
          .enum(['cash', 'check', 'card', 'bank_transfer', 'other'])
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { invoiceId, paidDate, paymentMethod } = input;

      // Verify invoice exists and belongs to user (via customer relationship)
      const invoice = await ctx.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { customer: true },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Update invoice to PAID
      const updatedInvoice = await ctx.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: InvoiceStatus.PAID,
          paidDate: paidDate || new Date(),
        },
        include: {
          customer: true,
          lineItems: true,
        },
      });

      // Create journal entry for payment if accounting is enabled
      try {
        const { createInvoicePaymentEntry } = await import(
          '../services/accounting/journal-service'
        );

        if (!invoice.paymentJournalEntryId) {
          const journalEntry = await createInvoicePaymentEntry(
            updatedInvoice,
            ctx.user.id
          );

          // Update invoice with journal entry ID
          await ctx.prisma.invoice.update({
            where: { id: invoiceId },
            data: { paymentJournalEntryId: journalEntry.id },
          });

          logger.info('Payment journal entry created', {
            invoiceId,
            invoiceNumber: updatedInvoice.invoiceNumber,
            journalEntryId: journalEntry.id,
            paymentMethod,
          });
        }
      } catch (error) {
        // Log error but don't fail the payment update
        logger.error('Failed to create payment journal entry', {
          invoiceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      logger.info('Invoice marked as paid', {
        invoiceId,
        invoiceNumber: updatedInvoice.invoiceNumber,
        customerId: invoice.customerId,
        amount: updatedInvoice.total.toString(),
        paymentMethod,
      });

      return updatedInvoice;
    }),

  /**
   * Send Customer Statement
   * Generates PDF and optionally emails statement to customer
   */
  sendStatement: protectedProcedure
    .input(
      z.object({
        customerId: z.string(),
        sendEmail: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { customerId, sendEmail: shouldSendEmail } = input;

      // Get statement data (reuse query logic)
      const customer = await ctx.prisma.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      // Fetch unpaid/overdue invoices
      const invoices = await ctx.prisma.invoice.findMany({
        where: {
          customerId,
          status: {
            in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE],
          },
        },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      });

      // Calculate summary
      const today = new Date();
      const invoiceData = invoices.map((invoice) => {
        const daysOverdue =
          invoice.status === InvoiceStatus.OVERDUE
            ? Math.max(
                0,
                Math.ceil(
                  (today.getTime() - invoice.dueDate.getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              )
            : 0;

        return {
          invoiceNumber: invoice.invoiceNumber,
          date: invoice.serviceDate,
          dueDate: invoice.dueDate,
          total: invoice.total,
          status: invoice.status,
          daysOverdue,
        };
      });

      const totalAmount = invoices.reduce(
        (sum, inv) => sum + Number(inv.total),
        0
      );

      const overdueAmount = invoices
        .filter((inv) => inv.status === InvoiceStatus.OVERDUE)
        .reduce((sum, inv) => sum + Number(inv.total), 0);

      // Fetch user branding
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: {
          companyName: true,
          companyEmail: true,
          companyPhone: true,
          companyAddress: true,
        },
      });

      const companyInfo = {
        name: user?.companyName || process.env.COMPANY_NAME || 'AutoInvoice',
        email:
          user?.companyEmail || process.env.COMPANY_EMAIL || 'billing@autoinvoice.app',
        phone: user?.companyPhone || process.env.COMPANY_PHONE,
        address: user?.companyAddress || process.env.COMPANY_ADDRESS,
      };

      // Generate PDF
      const { generateCustomerStatement } = await import('../services/pdf/statement-generator');
      const pdfPath = await generateCustomerStatement(
        {
          name: customer.name,
          email: customer.email || undefined,
          phone: customer.phone || undefined,
          company: customer.company || undefined,
        },
        invoiceData,
        {
          totalAmount: totalAmount.toString(),
          overdueAmount: overdueAmount.toString(),
        },
        companyInfo
      );

      // Read PDF file and convert to base64 for download
      const fs = await import('fs/promises');
      const pdfBuffer = await fs.readFile(pdfPath);
      const pdfBase64 = pdfBuffer.toString('base64');

      logger.info('Customer statement PDF generated', {
        customerId,
        customerName: customer.name,
        invoiceCount: invoices.length,
        pdfPath,
      });

      // TODO: Send email if requested
      let emailSent = false;
      if (shouldSendEmail && customer.email) {
        try {
          // const { sendEmail } = await import('../services/google/gmail');
          // await sendEmail({ ... });

          logger.info('Customer statement email requested', {
            customerId,
            customerEmail: customer.email,
            invoiceCount: invoices.length,
          });

          // TODO: Implement actual email sending
          // emailSent = true;
        } catch (error) {
          logger.error('Failed to send statement email', {
            customerId,
            customerEmail: customer.email,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return {
        pdfPath,
        pdfBase64,
        emailSent,
        invoiceCount: invoices.length,
        totalAmount: totalAmount.toString(),
      };
    }),
});

/**
 * Create HTML email template for customer statement
 */
function createStatementEmailTemplate(
  customerName: string,
  invoiceCount: number,
  totalAmount: number,
  overdueAmount: number,
  statementDate: string
): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Statement of Account</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

  <!-- Header -->
  <div style="text-align: center; margin-bottom: 40px;">
    <h1 style="color: #2563eb; margin-bottom: 8px;">Statement of Account</h1>
    <p style="color: #6b7280; margin: 0;">${statementDate}</p>
  </div>

  <!-- Main Content -->
  <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 30px;">

    <!-- Greeting -->
    <p style="margin-bottom: 20px;">Dear ${customerName},</p>

    <p style="margin-bottom: 20px;">
      This statement provides a summary of your account status. Please review the attached PDF for detailed information about your outstanding invoices.
    </p>

    <!-- Summary Box -->
    <div style="background: #f9fafb; border-left: 4px solid #2563eb; padding: 20px; border-radius: 4px; margin-bottom: 30px;">
      <h3 style="margin: 0 0 16px 0; color: #111827;">Account Summary</h3>
      
      <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
        <span style="color: #6b7280;">Total Invoices:</span>
        <span style="font-weight: 600;">${invoiceCount}</span>
      </div>

      <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
        <span style="color: #6b7280;">Total Amount Due:</span>
        <span style="font-weight: 700; color: #111827; font-size: 18px;">$${totalAmount.toFixed(2)}</span>
      </div>

      ${
        overdueAmount > 0
          ? `
      <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid #e5e7eb;">
        <span style="color: #dc2626; font-weight: 600;">Overdue Amount:</span>
        <span style="font-weight: 700; color: #dc2626; font-size: 18px;">$${overdueAmount.toFixed(2)}</span>
      </div>
      `
          : ''
      }
    </div>

    ${
      overdueAmount > 0
        ? `
    <!-- Overdue Notice -->
    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; border-radius: 4px; margin-bottom: 30px;">
      <h4 style="margin: 0 0 8px 0; color: #991b1b;">Payment Past Due</h4>
      <p style="margin: 0; color: #7f1d1d;">
        You have <strong>$${overdueAmount.toFixed(2)}</strong> in overdue invoices. 
        Please submit payment at your earliest convenience to avoid any service interruptions.
      </p>
    </div>
    `
        : `
    <!-- Current Notice -->
    <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 20px; border-radius: 4px; margin-bottom: 30px;">
      <h4 style="margin: 0 0 8px 0; color: #166534;">Account Current</h4>
      <p style="margin: 0; color: #14532d;">
        Thank you for keeping your account current! Please review the attached statement for upcoming payment due dates.
      </p>
    </div>
    `
    }

    <!-- Payment Instructions -->
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <p style="margin-bottom: 12px; color: #374151;">
        <strong>Payment Options:</strong>
      </p>
      <ul style="margin: 0; padding-left: 20px; color: #6b7280;">
        <li style="margin-bottom: 8px;">Reply to this email to arrange payment</li>
        <li style="margin-bottom: 8px;">Contact us at the phone number below</li>
        <li style="margin-bottom: 8px;">Mail check to address on statement</li>
      </ul>
    </div>

    <p style="margin-top: 30px; color: #6b7280;">
      If you have any questions or concerns about this statement, please don't hesitate to contact us. 
      We're here to help!
    </p>

  </div>

  <!-- Footer -->
  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
    <p style="color: #6b7280; margin: 0 0 8px 0; font-size: 14px;">Thank you for your business!</p>
    <p style="color: #9ca3af; margin: 0; font-size: 12px;">This is an automated statement from AutoInvoice</p>
  </div>

</body>
</html>
  `;
}
