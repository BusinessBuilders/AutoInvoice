import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { addHours, addDays, startOfDay } from 'date-fns';

/**
 * Request calendar permissions
 */
export async function requestCalendarPermissions(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

/**
 * Get the default calendar ID
 */
export async function getDefaultCalendarId(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

  // Try to find the primary calendar
  const primaryCalendar = calendars.find(
    cal => cal.isPrimary || cal.allowsModifications
  );

  return primaryCalendar?.id || calendars[0]?.id || null;
}

/**
 * Create calendar event for follow-up
 */
export async function createFollowUpEvent(params: {
  title: string;
  notes?: string;
  startDate: Date;
  durationMinutes?: number;
  location?: string;
}): Promise<string> {
  const { title, notes, startDate, durationMinutes = 30, location } = params;

  const calendarId = await getDefaultCalendarId();
  if (!calendarId) {
    throw new Error('No calendar available');
  }

  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  const eventId = await Calendar.createEventAsync(calendarId, {
    title,
    notes,
    startDate,
    endDate,
    location,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  return eventId;
}

/**
 * Quick reminder presets
 */
export const REMINDER_PRESETS = {
  NOW: {
    label: 'Now',
    getDate: () => new Date(),
  },
  ONE_HOUR: {
    label: '1 Hour',
    getDate: () => addHours(new Date(), 1),
  },
  THREE_HOURS: {
    label: '3 Hours',
    getDate: () => addHours(new Date(), 3),
  },
  TOMORROW: {
    label: 'Tomorrow',
    getDate: () => addDays(startOfDay(new Date()), 1),
  },
  NEXT_WEEK: {
    label: 'Next Week',
    getDate: () => addDays(new Date(), 7),
  },
} as const;

/**
 * Create reminder with notification
 */
export async function createReminder(params: {
  title: string;
  description?: string;
  remindAt: Date;
  leadId?: string;
}): Promise<string> {
  const { title, description, remindAt, leadId } = params;

  // Create calendar event
  const eventId = await createFollowUpEvent({
    title: `Reminder: ${title}`,
    notes: description ? `${description}\n\nLead ID: ${leadId}` : undefined,
    startDate: remindAt,
    durationMinutes: 15,
  });

  return eventId;
}
