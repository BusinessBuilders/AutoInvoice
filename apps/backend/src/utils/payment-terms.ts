/**
 * Payment terms utilities for invoice due date calculation
 */

/**
 * Calculate due date based on issue date and payment terms
 * @param issueDate - The invoice issue date
 * @param paymentTerms - Payment terms string (e.g., "Net 30", "Due on Receipt", "Net 60")
 * @returns The calculated due date
 */
export function calculateDueDate(issueDate: Date, paymentTerms: string): Date {
  const dueDate = new Date(issueDate);

  // Normalize the payment terms string
  const terms = paymentTerms.trim().toLowerCase();

  // Parse different payment term formats
  if (terms === 'due on receipt' || terms === 'immediate') {
    // Due immediately
    return dueDate;
  }

  // Match "Net X" or "Net X days" pattern
  const netMatch = terms.match(/net\s+(\d+)(?:\s+days?)?/);
  if (netMatch) {
    const days = parseInt(netMatch[1], 10);
    dueDate.setDate(dueDate.getDate() + days);
    return dueDate;
  }

  // Match "X days" pattern
  const daysMatch = terms.match(/(\d+)\s+days?/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    dueDate.setDate(dueDate.getDate() + days);
    return dueDate;
  }

  // Default to Net 30 if we can't parse the terms
  dueDate.setDate(dueDate.getDate() + 30);
  return dueDate;
}
