const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_COLLAB_SERVER_URL ||
  "https://calidraw-room.onrender.com"
).replace(/\/+$/, "");

export async function fetchNegotiationState(roomId) {
  const res = await fetch(`${API_BASE_URL}/api/negotiation/${encodeURIComponent(roomId)}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error("Failed to fetch negotiation state");
  }
  const data = await res.json();
  return data.negotiation;
}

export async function createPaypalInvoiceForNegotiation(negotiationId, payload) {
  const res = await fetch(
    `${API_BASE_URL}/api/negotiation/${encodeURIComponent(negotiationId)}/create-invoice`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to create PayPal invoice");
  }
  return data;
}

export async function sendPaypalInvoiceForNegotiation(negotiationId, payload = {}) {
  const res = await fetch(
    `${API_BASE_URL}/api/negotiation/${encodeURIComponent(negotiationId)}/send-invoice`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to send PayPal invoice");
  }
  return data;
}
