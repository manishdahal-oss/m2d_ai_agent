/** Search text for Convex full-text indexes: name, city, customer id and phone digits (full + local). */
export function customerSearchText(c: { name?: string; phone: string; externalId?: string; city?: string }): string {
  const digits = c.phone.replace(/\D/g, '');
  return [c.name, c.city, c.externalId, digits, digits.slice(-10)].filter(Boolean).join(' ');
}

export function conversationSearchText(c: { customerName?: string; customerPhone: string }): string {
  const digits = c.customerPhone.replace(/\D/g, '');
  return [c.customerName, digits, digits.slice(-10)].filter(Boolean).join(' ');
}
