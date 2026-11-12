/**
 * Invoice API Client for Calidraw Bill
 */

const STORAGE_USER_ID_KEY = "calidraw:user_id";

// Get or generate a persistent user ID for authentication
export function getOrCreateUserId() {
  let userId = localStorage.getItem(STORAGE_USER_ID_KEY);
  if (!userId) {
    // Check if user has an excplus-auth cookie
    const match = document.cookie.match(/(?:^|;\s*)excplus-auth=([^;]+)/);
    if (match && match[1]) {
      userId = decodeURIComponent(match[1]);
    } else {
      userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
    localStorage.setItem(STORAGE_USER_ID_KEY, userId);
  }
  return userId;
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_COLLAB_SERVER_URL ||
  "https://calidraw-room.onrender.com"
).replace(/\/+$/, "");

function getHeaders() {
  const userId = getOrCreateUserId();
  return {
    "Content-Type": "application/json",
    "x-user-id": userId,
    Authorization: `Bearer ${userId}`,
  };
}

export async function generateInvoiceDraft({ image, annotations, context }) {
  const response = await fetch(`${API_BASE_URL}/api/invoices/generate`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      image,
      annotations,
      context,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to generate invoice with AI");
  }

  return data;
}

/**
 * Enhance an already-prepared invoice draft using AI.
 * AI improves descriptions only — prices and quantities are preserved.
 */
export async function enhanceInvoiceDraft({ items, currency, title, context }) {
  const response = await fetch(`${API_BASE_URL}/api/invoices/enhance`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ items, currency, title, context }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || "AI enhancement unavailable");
  }

  return data;
}

export async function saveInvoice(invoiceData) {
  const response = await fetch(`${API_BASE_URL}/api/invoices`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(invoiceData),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to save invoice");
  }

  return data;
}

export async function fetchInvoices() {
  const response = await fetch(`${API_BASE_URL}/api/invoices`, {
    method: "GET",
    headers: getHeaders(),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to retrieve invoices");
  }

  return data.invoices || [];
}

export async function fetchInvoiceById(id) {
  const response = await fetch(`${API_BASE_URL}/api/invoices/${id}`, {
    method: "GET",
    headers: getHeaders(),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to retrieve invoice");
  }

  return data.invoice;
}
