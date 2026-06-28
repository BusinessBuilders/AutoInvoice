/** Shared Business OS UI helpers. */

export function jobStatusColor(status: string): string {
  switch (status) {
    case 'REQUESTED': return 'bg-gray-100 text-gray-800';
    case 'SCHEDULED': return 'bg-blue-100 text-blue-800';
    case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-800';
    case 'COMPLETED': return 'bg-purple-100 text-purple-800';
    case 'CLOSED': return 'bg-green-100 text-green-800';
    case 'CANCELLED': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

export function money(n: number | string | null | undefined): string {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function cents(n: number | string | bigint | null | undefined): string {
  return money(Number(n ?? 0) / 100);
}

export const ENGINE_LABELS: Record<string, string> = {
  FIELD_SERVICE: '🌱 Field Service',
  SUBSCRIPTION: '🔁 Subscriptions',
  COMMERCE: '🛒 Commerce',
  SERVICES: '🧾 Services',
  OTHER: '✨ Other',
};
