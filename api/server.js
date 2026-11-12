
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: (process.env.WEB_ORIGIN || "http://localhost:5173")
      .split(",")
      .map((value) => value.trim()),
  }),
);

app.use(express.json({ limit: "100kb" }));

const PORT = Number(process.env.PORT || 8787);

const PAYPAL_BASE_URL =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing PayPal API credentials.");
  process.exit(1);
}

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${CLIENT_ID}:${CLIENT_SECRET}`,
  ).toString("base64");

  const response = await fetch(
    `${PAYPAL_BASE_URL}/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error_description ||
        data.error ||
        "PayPal authentication failed.",
    );
  }

  cachedToken = data.access_token;

  tokenExpiresAt =
    Date.now() + (data.expires_in - 60) * 1000;

  return cachedToken;
}

async function paypalRequest(path, options = {}) {
  const token = await getAccessToken();

  const response = await fetch(
    `${PAYPAL_BASE_URL}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {}),
      },
    },
  );

  const raw = await response.text();

  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { message: raw };
  }

  if (!response.ok) {
    const message =
      data.message ||
      data.details?.[0]?.description ||
      data.name ||
      "PayPal request failed.";

    const error = new Error(message);
    error.status = response.status;
    error.details = data.details;

    throw error;
  }

  return data;
}

function validateInvoice(invoice) {
  if (!invoice || typeof invoice !== "object") {
    throw new Error("Invalid invoice data.");
  }

  if (invoice.currency !== "USD") {
    throw new Error(
      "PayPal Invoicing currently supports USD for this integration. INR invoices can be downloaded locally instead.",
    );
  }

  if (!invoice.customer?.email?.trim()) {
    throw new Error("Customer email is required.");
  }

  if (!Array.isArray(invoice.items) || invoice.items.length === 0) {
    throw new Error("At least one invoice item is required.");
  }

  if (invoice.items.length > 100) {
    throw new Error("An invoice can contain at most 100 items.");
  }

  const items = invoice.items.map((item) => {
    const description = String(item.description || "").trim();
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);

    if (!description || description.length > 200) {
      throw new Error("Each item needs a description of at most 200 characters.");
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Invalid item quantity.");
    }

    if (
      !Number.isFinite(unitPrice) ||
      unitPrice < 0 ||
      unitPrice > 1000000
    ) {
      throw new Error("Invalid item price.");
    }

    return {
      name: description,
      description,
      quantity: String(quantity),
      unit_amount: {
        currency_code: "USD",
        value: unitPrice.toFixed(2),
      },
    };
  });

  return items;
}

function splitName(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);

  return {
    given_name: parts[0] || "Customer",
    surname: parts.slice(1).join(" ") || " ",
  };
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

/**
 * Create a draft invoice.
 *
 * This does NOT email the customer yet.
 */
app.post("/api/paypal/invoices", async (req, res) => {
  try {
    const invoice = req.body;

    const items = validateInvoice(invoice);

    const customerName = splitName(
      invoice.customer.name,
    );

    const sellerName = splitName(
      invoice.seller?.name,
    );

    const payload = {
      detail: {
        currency_code: "USD",
        invoice_date: new Date().toISOString().slice(0, 10),
        payment_term: {
          term_type: "DUE_ON_RECEIPT",
        },
        note: "Thank you for your business.",
      },

      invoicer: {
        name: sellerName,
        ...(invoice.seller?.name
          ? { business_name: invoice.seller.name }
          : {}),
      },

      primary_recipients: [
        {
          billing_info: {
            email_address: invoice.customer.email.trim(),
            name: customerName,
          },
        },
      ],

      items,
    };

    const paypalInvoice = await paypalRequest(
      "/v2/invoicing/invoices",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    res.status(201).json({
      success: true,
      paypalInvoiceId: paypalInvoice.id,
      status: paypalInvoice.status,
      invoiceNumber:
        paypalInvoice.detail?.invoice_number || null,
      paypalInvoice,
    });
  } catch (error) {
    console.error("Create invoice error:", error);

    res.status(error.status || 400).json({
      success: false,
      message: error.message,
      details: error.details || [],
    });
  }
});

/**
 * Send an existing draft invoice to its customer.
 */
app.post(
  "/api/paypal/invoices/:invoiceId/send",
  async (req, res) => {
    try {
      const { invoiceId } = req.params;

      const sendResult = await paypalRequest(
        `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`,
        {
          method: "POST",
          body: JSON.stringify({
            send_to_recipient: true,
            send_to_invoicer: true,
          }),
        },
      );

      // Retrieve the invoice to obtain the latest status and
      // PayPal-hosted recipient view URL.
      const invoice = await paypalRequest(
        `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`,
        { method: "GET" },
      );

      const payerLink =
        invoice.metadata?.recipient_view_url ||
        sendResult.links?.find(
          (link) => link.rel === "payer-view",
        )?.href ||
        null;

      res.json({
        success: true,
        paypalInvoiceId: invoice.id,
        status: invoice.status,
        recipientViewUrl: payerLink,
        invoice,
      });
    } catch (error) {
      console.error("Send invoice error:", error);

      res.status(error.status || 400).json({
        success: false,
        message: error.message,
        details: error.details || [],
      });
    }
  },
);

/**
 * Retrieve current invoice status from PayPal.
 */
app.get(
  "/api/paypal/invoices/:invoiceId",
  async (req, res) => {
    try {
      const invoice = await paypalRequest(
        `/v2/invoicing/invoices/${encodeURIComponent(req.params.invoiceId)}`,
        { method: "GET" },
      );

      res.json({
        success: true,
        paypalInvoiceId: invoice.id,
        status: invoice.status,
        recipientViewUrl:
          invoice.metadata?.recipient_view_url || null,
        invoice,
      });
    } catch (error) {
      console.error("Get invoice error:", error);

      res.status(error.status || 400).json({
        success: false,
        message: error.message,
      });
    }
  },
);

app.listen(PORT, () => {
  console.log(`Calidraw Bill API running on port ${PORT}`);
  console.log(`PayPal environment: ${process.env.PAYPAL_ENV || "sandbox"}`);
});
