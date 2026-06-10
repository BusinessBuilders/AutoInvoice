/**
 * CSV Generator Utility
 * Generates CSV format for business contacts export
 */

interface CSVContact {
  name: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  title?: string | null;
  website?: string | null;
  linkedIn?: string | null;
  twitter?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  category?: string | null;
  notes?: string | null;
  status?: string | null;
}

/**
 * Escape CSV field value
 * Wraps in quotes if contains comma, quote, or newline
 */
function escapeCSV(value: string | null | undefined): string {
  if (!value) return '';

  const stringValue = String(value);

  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Generate CSV headers
 */
function getCSVHeaders(): string[] {
  return [
    'Name',
    'Phone',
    'Email',
    'Company',
    'Title',
    'Website',
    'LinkedIn',
    'Twitter',
    'Facebook',
    'Instagram',
    'Address Line 1',
    'Address Line 2',
    'City',
    'State',
    'Zip Code',
    'Country',
    'Category',
    'Status',
    'Notes',
  ];
}

/**
 * Convert contact to CSV row
 */
function contactToCSVRow(contact: CSVContact): string[] {
  return [
    escapeCSV(contact.name),
    escapeCSV(contact.phone),
    escapeCSV(contact.email),
    escapeCSV(contact.company),
    escapeCSV(contact.title),
    escapeCSV(contact.website),
    escapeCSV(contact.linkedIn),
    escapeCSV(contact.twitter),
    escapeCSV(contact.facebook),
    escapeCSV(contact.instagram),
    escapeCSV(contact.addressLine1),
    escapeCSV(contact.addressLine2),
    escapeCSV(contact.city),
    escapeCSV(contact.state),
    escapeCSV(contact.zipCode),
    escapeCSV(contact.country),
    escapeCSV(contact.category),
    escapeCSV(contact.status),
    escapeCSV(contact.notes),
  ];
}

/**
 * Generate CSV from array of contacts
 */
export function generateCSV(contacts: CSVContact[]): string {
  const headers = getCSVHeaders();
  const rows = contacts.map((contact) => contactToCSVRow(contact));

  // Combine headers and rows
  const allRows = [headers, ...rows];

  // Join with newlines
  return allRows.map((row) => row.join(',')).join('\n');
}

/**
 * Get proper MIME type for CSV
 */
export function getCSVMimeType(): string {
  return 'text/csv;charset=utf-8';
}

/**
 * Get suggested filename for CSV export
 */
export function getCSVFilename(count: number = 1): string {
  const timestamp = new Date().toISOString().split('T')[0];
  if (count === 1) {
    return `contact_${timestamp}.csv`;
  }
  return `contacts_${count}_${timestamp}.csv`;
}
