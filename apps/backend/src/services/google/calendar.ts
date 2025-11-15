import { google } from 'googleapis';
import { oauth2Client } from './client';
import logger from '../../utils/logger';
import { prisma } from '../../utils/db';

/**
 * Google Calendar Service - Production-Ready
 * Schedule jobs, follow-ups, and payment reminders
 */

export interface CalendarEventOptions {
  summary: string;
  description: string;
  start: Date;
  end: Date;
  location?: string;
  attendees?: string[];
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
}

/**
 * Create calendar event
 */
export async function createCalendarEvent(options: CalendarEventOptions): Promise<string> {
  if (!oauth2Client) {
    throw new Error('Google OAuth2 not configured');
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  try {
    const event = {
      summary: options.summary,
      description: options.description,
      location: options.location,
      start: {
        dateTime: options.start.toISOString(),
        timeZone: 'America/New_York', // TODO: Make configurable
      },
      end: {
        dateTime: options.end.toISOString(),
        timeZone: 'America/New_York',
      },
      attendees: options.attendees?.map((email) => ({ email })),
      reminders: options.reminders || {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 60 }, // 1 hour before
        ],
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all', // Send email notifications to attendees
    });

    logger.info('Calendar event created', {
      eventId: response.data.id,
      summary: options.summary,
      start: options.start,
    });

    return response.data.id!;
  } catch (error: any) {
    logger.error('Calendar event creation error:', error);
    throw new Error(`Failed to create calendar event: ${error.message}`);
  }
}

/**
 * Schedule job/service appointment
 */
export async function scheduleServiceJob(options: {
  customerId: string;
  serviceDescription: string;
  scheduledDate: Date;
  duration: number; // minutes
  location?: string;
}): Promise<string> {
  const customer = await prisma.customer.findUnique({
    where: { id: options.customerId },
  });

  if (!customer) {
    throw new Error(`Customer ${options.customerId} not found`);
  }

  const endDate = new Date(options.scheduledDate.getTime() + options.duration * 60 * 1000);

  const eventId = await createCalendarEvent({
    summary: `${options.serviceDescription} - ${customer.name}`,
    description: `Service job for ${customer.name}\n\n${options.serviceDescription}\n\nCustomer: ${customer.name}\nPhone: ${customer.phone || 'N/A'}\nEmail: ${customer.email || 'N/A'}`,
    start: options.scheduledDate,
    end: endDate,
    location: options.location || customer.addressLine1 || undefined,
    attendees: customer.email ? [customer.email] : undefined,
  });

  logger.info('Service job scheduled', {
    eventId,
    customerId: options.customerId,
    scheduledDate: options.scheduledDate,
  });

  return eventId;
}

/**
 * Schedule follow-up for invoice
 */
export async function scheduleInvoiceFollowUp(invoiceId: string, followUpDate: Date): Promise<string> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
    },
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  const eventId = await createCalendarEvent({
    summary: `Follow up: Invoice ${invoice.invoiceNumber}`,
    description: `Follow up on invoice payment\n\nInvoice: ${invoice.invoiceNumber}\nCustomer: ${invoice.customer.name}\nAmount: $${invoice.total.toFixed(2)}\nDue Date: ${invoice.dueDate.toLocaleDateString()}\n\nCheck if payment has been received.`,
    start: followUpDate,
    end: new Date(followUpDate.getTime() + 30 * 60 * 1000), // 30 minutes
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 0 }, // At the time
      ],
    },
  });

  logger.info('Invoice follow-up scheduled', {
    eventId,
    invoiceNumber: invoice.invoiceNumber,
    followUpDate,
  });

  return eventId;
}

/**
 * Schedule payment reminder
 */
export async function schedulePaymentReminderEvent(invoiceId: string): Promise<string> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
    },
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  // Schedule for 3 days before due date
  const reminderDate = new Date(invoice.dueDate.getTime() - 3 * 24 * 60 * 60 * 1000);

  const eventId = await createCalendarEvent({
    summary: `Payment Reminder: ${invoice.customer.name}`,
    description: `Send payment reminder\n\nInvoice: ${invoice.invoiceNumber}\nCustomer: ${invoice.customer.name}\nAmount: $${invoice.total.toFixed(2)}\nDue: ${invoice.dueDate.toLocaleDateString()}\n\nSend reminder 3 days before due date.`,
    start: reminderDate,
    end: new Date(reminderDate.getTime() + 15 * 60 * 1000), // 15 minutes
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 0 },
      ],
    },
  });

  logger.info('Payment reminder event scheduled', {
    eventId,
    invoiceNumber: invoice.invoiceNumber,
    reminderDate,
  });

  return eventId;
}

/**
 * List upcoming events
 */
export async function listUpcomingEvents(days: number = 7): Promise<any[]> {
  if (!oauth2Client) {
    throw new Error('Google OAuth2 not configured');
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return response.data.items || [];
  } catch (error: any) {
    logger.error('Calendar list error:', error);
    throw new Error(`Failed to list calendar events: ${error.message}`);
  }
}

/**
 * Delete calendar event
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  if (!oauth2Client) {
    throw new Error('Google OAuth2 not configured');
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });

    logger.info('Calendar event deleted', { eventId });
  } catch (error: any) {
    logger.error('Calendar delete error:', error);
    throw new Error(`Failed to delete calendar event: ${error.message}`);
  }
}

/**
 * Update calendar event
 */
export async function updateCalendarEvent(
  eventId: string,
  updates: Partial<CalendarEventOptions>
): Promise<void> {
  if (!oauth2Client) {
    throw new Error('Google OAuth2 not configured');
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  try {
    const event: any = {};

    if (updates.summary) event.summary = updates.summary;
    if (updates.description) event.description = updates.description;
    if (updates.location) event.location = updates.location;
    if (updates.start) {
      event.start = {
        dateTime: updates.start.toISOString(),
        timeZone: 'America/New_York',
      };
    }
    if (updates.end) {
      event.end = {
        dateTime: updates.end.toISOString(),
        timeZone: 'America/New_York',
      };
    }
    if (updates.attendees) {
      event.attendees = updates.attendees.map((email) => ({ email }));
    }

    await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: event,
    });

    logger.info('Calendar event updated', { eventId });
  } catch (error: any) {
    logger.error('Calendar update error:', error);
    throw new Error(`Failed to update calendar event: ${error.message}`);
  }
}
