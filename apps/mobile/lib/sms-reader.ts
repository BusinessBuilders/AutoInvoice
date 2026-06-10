import * as SMS from 'expo-sms';
import { Platform, PermissionsAndroid } from 'react-native';

export interface SmsMessage {
  id: string;
  address: string; // Phone number
  body: string;
  date: number;
  read: boolean;
}

/**
 * Request SMS permissions (Android only)
 */
export async function requestSmsPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      {
        title: 'SMS Permission',
        message: 'AutoInvoice needs access to your SMS messages to help you manage leads',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.error('Error requesting SMS permissions:', err);
    return false;
  }
}

/**
 * Check if SMS is available on device
 */
export async function isSmsAvailable(): Promise<boolean> {
  return await SMS.isAvailableAsync();
}

/**
 * Send SMS using native messaging app (no Twilio costs!)
 * Opens the native SMS app with pre-filled message
 */
export async function sendSmsViaNativeApp(
  phoneNumber: string,
  message: string
): Promise<void> {
  const isAvailable = await SMS.isAvailableAsync();

  if (!isAvailable) {
    throw new Error('SMS is not available on this device');
  }

  // This opens the native SMS app with pre-filled message
  // User reviews and sends manually (no API costs!)
  await SMS.sendSMSAsync([phoneNumber], message);
}

/**
 * Parse SMS messages to detect potential leads
 * Looks for keywords like "quote", "lawn", "hydroseed", etc.
 */
export function parseLeadFromSms(message: SmsMessage): {
  isLead: boolean;
  projectType?: string;
  estimatedArea?: number;
  keywords: string[];
} {
  const body = message.body.toLowerCase();
  const keywords: string[] = [];

  // Project type detection
  const projectTypes = [
    { key: 'hydroseed', patterns: ['hydroseed', 'hydro seed', 'seeding'] },
    { key: 'lawn-mowing', patterns: ['lawn', 'mowing', 'cut grass', 'lawn care'] },
    { key: 'fertilizer', patterns: ['fertilizer', 'fertilize', 'fert'] },
    { key: 'mulch', patterns: ['mulch', 'mulching'] },
    { key: 'tree-trimming', patterns: ['tree', 'trimming', 'pruning'] },
  ];

  let projectType: string | undefined;

  for (const type of projectTypes) {
    if (type.patterns.some(pattern => body.includes(pattern))) {
      projectType = type.key;
      keywords.push(...type.patterns.filter(p => body.includes(p)));
      break;
    }
  }

  // Lead indicators
  const leadIndicators = ['quote', 'price', 'how much', 'cost', 'estimate', 'interested'];
  const hasLeadIndicator = leadIndicators.some(indicator => {
    if (body.includes(indicator)) {
      keywords.push(indicator);
      return true;
    }
    return false;
  });

  // Area detection (sqft, square feet, etc.)
  const areaMatches = body.match(/(\d+)\s*(sqft|square feet|sq ft|square foot)/);
  const estimatedArea = areaMatches ? parseInt(areaMatches[1]) : undefined;

  const isLead = hasLeadIndicator || !!projectType || !!estimatedArea;

  return {
    isLead,
    projectType,
    estimatedArea,
    keywords,
  };
}
