/**
 * vCard Generator Utility
 * Generates vCard 3.0 format for business contacts
 */

interface VCardContact {
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
  notes?: string | null;
}

/**
 * Escape special characters for vCard format
 */
function escapeVCard(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Generate a single vCard from contact data
 */
export function generateVCard(contact: VCardContact): string {
  const lines: string[] = [];

  // vCard header
  lines.push('BEGIN:VCARD');
  lines.push('VERSION:3.0');

  // Name (required)
  const nameParts = contact.name.split(' ');
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
  const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : contact.name;
  lines.push(`N:${escapeVCard(lastName)};${escapeVCard(firstName)};;;`);
  lines.push(`FN:${escapeVCard(contact.name)}`);

  // Organization and title
  if (contact.company) {
    lines.push(`ORG:${escapeVCard(contact.company)}`);
  }
  if (contact.title) {
    lines.push(`TITLE:${escapeVCard(contact.title)}`);
  }

  // Phone
  if (contact.phone) {
    lines.push(`TEL;TYPE=WORK,VOICE:${escapeVCard(contact.phone)}`);
  }

  // Email
  if (contact.email) {
    lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(contact.email)}`);
  }

  // Website
  if (contact.website) {
    lines.push(`URL:${escapeVCard(contact.website)}`);
  }

  // Address
  const hasAddress =
    contact.addressLine1 ||
    contact.addressLine2 ||
    contact.city ||
    contact.state ||
    contact.zipCode ||
    contact.country;

  if (hasAddress) {
    const addressParts = [
      '',  // PO Box
      escapeVCard(contact.addressLine2 || ''),  // Extended address
      escapeVCard(contact.addressLine1 || ''),  // Street
      escapeVCard(contact.city || ''),  // Locality
      escapeVCard(contact.state || ''),  // Region
      escapeVCard(contact.zipCode || ''),  // Postal code
      escapeVCard(contact.country || ''),  // Country
    ];
    lines.push(`ADR;TYPE=WORK:${addressParts.join(';')}`);
  }

  // Social media URLs as additional URLs or X- fields
  if (contact.linkedIn) {
    lines.push(`X-SOCIALPROFILE;TYPE=linkedin:${escapeVCard(contact.linkedIn)}`);
  }
  if (contact.twitter) {
    lines.push(`X-SOCIALPROFILE;TYPE=twitter:${escapeVCard(contact.twitter)}`);
  }
  if (contact.facebook) {
    lines.push(`X-SOCIALPROFILE;TYPE=facebook:${escapeVCard(contact.facebook)}`);
  }
  if (contact.instagram) {
    lines.push(`X-SOCIALPROFILE;TYPE=instagram:${escapeVCard(contact.instagram)}`);
  }

  // Notes
  if (contact.notes) {
    lines.push(`NOTE:${escapeVCard(contact.notes)}`);
  }

  // vCard footer
  lines.push('END:VCARD');

  return lines.join('\r\n');
}

/**
 * Generate multiple vCards concatenated together
 */
export function generateVCardBatch(contacts: VCardContact[]): string {
  return contacts.map((contact) => generateVCard(contact)).join('\r\n');
}

/**
 * Get proper MIME type for vCard
 */
export function getVCardMimeType(): string {
  return 'text/vcard;charset=utf-8';
}

/**
 * Get suggested filename for vCard export
 */
export function getVCardFilename(count: number = 1): string {
  const timestamp = new Date().toISOString().split('T')[0];
  if (count === 1) {
    return `contact_${timestamp}.vcf`;
  }
  return `contacts_${count}_${timestamp}.vcf`;
}
