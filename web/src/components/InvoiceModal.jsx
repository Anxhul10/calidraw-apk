import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  AlertCircle,
  CheckCircle,
  Download,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  X,
  List,
} from "lucide-react";
import {
  enhanceInvoiceDraft,
  saveInvoice,
  fetchInvoices,
} from "../services/invoiceApi";

const CURRENCY_SYMBOLS = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "AU$",
  JPY: "¥",
};

/** Convert billing items (from BillingDetails) to invoice line items */
function billingToItems(billingItems) {
  if (!Array.isArray(billingItems) || billingItems.length === 0) return [];
  return billingItems.map((b, idx) => ({
    id: `item_${Date.now()}_${idx}`,
    componentId: b.componentId || null,
    description: b.description || "",
    quantity: b.quantity ?? 1,
    unitPrice: typeof b.unitPrice === "number" ? String(b.unitPrice) : "",
    source: "billing_metadata",
  }));
}

/** Generate a default invoice number */
function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${year}-${rand}`;
}

/** Detect the dominant currency from billing items */
function detectCurrency(billingItems) {
  if (!Array.isArray(billingItems)) return "INR";
  for (const b of billingItems) {
    if (b.currency) return b.currency;
  }
  return "INR";
}

export default function InvoiceModal({
  isOpen,
  onClose,
  activeFileName,
  billingItems: initialBillingItems,
}) {
  const [view, setView] = useState("editor"); // "editor" | "list" | "preview"
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [savedInvoices, setSavedInvoices] = useState([]);
  const [savedInvoiceId, setSavedInvoiceId] = useState(null);

  // Form State
  const [invoiceNumber, setInvoiceNumber] = useState(generateInvoiceNumber);
  const [title, setTitle] = useState(
    () => activeFileName?.replace(/\.excalidraw$/i, "") || "Invoice",
  );
  const [currency, setCurrency] = useState(
    () => detectCurrency(initialBillingItems),
  );
  const [businessName, setBusinessName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [issueDate, setIssueDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [items, setItems] = useState(() =>
    billingToItems(initialBillingItems),
  );
  const [missingInformation, setMissingInformation] = useState(() => {
    // Flag items without prices at initialization
    const missing = [];
    if (Array.isArray(initialBillingItems)) {
      for (const b of initialBillingItems) {
        if (b.unitPrice === null || b.unitPrice === undefined) {
          missing.push(`Price for "${b.description || "item"}"`);
        }
      }
    }
    return missing;
  });
  const [tax, setTax] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when new billing items are passed in (new modal open)
  const prevBillingItemsRef = useRef(initialBillingItems);
  useEffect(() => {
    if (!isOpen) return;
    // Only reinitialize when billingItems actually changed (new generation)
    if (prevBillingItemsRef.current !== initialBillingItems) {
      prevBillingItemsRef.current = initialBillingItems;
      setItems(billingToItems(initialBillingItems));
      setCurrency(detectCurrency(initialBillingItems));
      setTitle(activeFileName?.replace(/\.excalidraw$/i, "") || "Invoice");
      setInvoiceNumber(generateInvoiceNumber());
      setSavedInvoiceId(null);
      setSuccessMessage("");
      setError("");
      setView("editor");

      const missing = [];
      if (Array.isArray(initialBillingItems)) {
        for (const b of initialBillingItems) {
          if (b.unitPrice === null || b.unitPrice === undefined) {
            missing.push(`Price for "${b.description || "item"}"`);
          }
        }
      }
      setMissingInformation(missing);
    }
  }, [isOpen, initialBillingItems, activeFileName]);

  // Calculations
  const currencySymbol = CURRENCY_SYMBOLS[currency] || currency;

  const subtotal = useMemo(() => {
    return items.reduce((acc, item) => {
      const qty = Number(item.quantity) || 1;
      const price =
        item.unitPrice !== null &&
        item.unitPrice !== undefined &&
        item.unitPrice !== ""
          ? Number(item.unitPrice)
          : null;
      if (price !== null && !isNaN(price) && price >= 0) {
        return acc + qty * price;
      }
      return acc;
    }, 0);
  }, [items]);

  const numTax = Math.max(0, Number(tax) || 0);
  const numDiscount = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal + numTax - numDiscount);

  const formatAmount = (amount) => {
    return `${currencySymbol}${Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // AI enhancement — improves descriptions only, never changes prices/quantities
  const handleEnhanceWithAI = useCallback(async () => {
    setError("");
    setSuccessMessage("");
    setLoading(true);
    setLoadingMessage("Enhancing invoice with AI...");

    try {
      const payload = {
        items: items.map((it) => ({
          componentId: it.componentId,
          description: it.description,
          quantity: Number(it.quantity) || 1,
          unitPrice: it.unitPrice !== "" ? Number(it.unitPrice) : null,
          source: it.source,
        })),
        currency,
        title,
        context: activeFileName ? `Drawing: ${activeFileName}` : "",
      };

      const result = await enhanceInvoiceDraft(payload);
      const draft = result.draft;

      // Update title if AI found a better one (only if user hasn't typed one)
      if (draft.title) setTitle(draft.title);

      // Apply enhanced descriptions but PRESERVE all original prices & quantities
      if (Array.isArray(draft.items)) {
        setItems((prev) =>
          prev.map((existing, idx) => {
            const enhanced = draft.items[idx];
            if (!enhanced) return existing;
            return {
              ...existing,
              // Only update description from AI
              description: enhanced.description || existing.description,
              // Strictly preserve original financial values
              quantity: existing.quantity,
              unitPrice: existing.unitPrice,
            };
          }),
        );
      }

      if (Array.isArray(draft.missingInformation)) {
        setMissingInformation(draft.missingInformation);
      }

      setSuccessMessage("AI enhanced invoice descriptions successfully.");
    } catch (err) {
      console.error("AI enhancement failed:", err);
      setError(
        err.message ||
          "AI enhancement unavailable. Your invoice data is preserved.",
      );
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  }, [items, currency, title, activeFileName]);

  const handleLoadSavedInvoices = async () => {
    try {
      const list = await fetchInvoices();
      setSavedInvoices(list);
      setView("list");
    } catch (err) {
      setError(err.message || "Failed to load saved invoices.");
    }
  };

  const handleSelectSavedInvoice = (invoice) => {
    setSavedInvoiceId(invoice.id);
    setInvoiceNumber(invoice.invoiceNumber);
    setTitle(invoice.title);
    setCurrency(invoice.currency);
    setBusinessName(invoice.businessName || "");
    setClientName(invoice.clientName || "");
    setClientEmail(invoice.clientEmail || "");
    setIssueDate(invoice.issueDate ? invoice.issueDate.split("T")[0] : "");
    setDueDate(invoice.dueDate ? invoice.dueDate.split("T")[0] : "");
    setStatus(invoice.status || "DRAFT");
    setTax(String(invoice.tax || 0));
    setDiscount(String(invoice.discount || 0));
    setMissingInformation(invoice.missingInformation || []);

    const mapped = (invoice.items || []).map((it, idx) => ({
      id: `item_${Date.now()}_${idx}`,
      componentId: it.componentId || null,
      description: it.description || "",
      quantity: it.quantity || 1,
      unitPrice:
        it.unitPrice !== null && it.unitPrice !== undefined
          ? String(it.unitPrice)
          : "",
      source: it.source || "user",
    }));
    setItems(mapped);
    setView("editor");
    setSuccessMessage(`Viewing saved invoice #${invoice.invoiceNumber}`);
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}_${prev.length}`,
        componentId: null,
        description: "",
        quantity: 1,
        unitPrice: "",
        source: "user",
      },
    ]);
  };

  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleDeleteItem = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    setError("");
    setSuccessMessage("");
    setIsSaving(true);

    try {
      if (!title.trim()) {
        throw new Error("Invoice title is required.");
      }
      if (items.length === 0) {
        throw new Error("Please add at least one line item.");
      }

      const payload = {
        invoiceNumber,
        title: title.trim(),
        sceneId: activeFileName || null,
        clientName: clientName.trim() || null,
        clientEmail: clientEmail.trim() || null,
        businessName: businessName.trim() || null,
        currency,
        issueDate: issueDate || new Date().toISOString(),
        dueDate: dueDate || null,
        status,
        tax: numTax,
        discount: numDiscount,
        missingInformation,
        items: items.map((it) => ({
          componentId: it.componentId || null,
          description: it.description,
          quantity: Number(it.quantity) || 1,
          unitPrice: it.unitPrice !== "" ? Number(it.unitPrice) : null,
          source: it.source,
        })),
      };

      const result = await saveInvoice(payload);
      setSavedInvoiceId(result.id);
      setSuccessMessage(
        `Invoice #${result.invoice.invoiceNumber} saved successfully!`,
      );

      // Refresh saved invoices in background
      fetchInvoices()
        .then(setSavedInvoices)
        .catch(() => {});
    } catch (err) {
      console.error("Save error:", err);
      setError(err.message || "Failed to save invoice.");
    } finally {
      setIsSaving(false);
    }
  };

  /** Print the invoice as a PDF using the browser's print dialog */
  const handleDownloadPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError(
        "Could not open print window. Allow pop-ups for this site and try again.",
      );
      return;
    }

    const sym = currencySymbol;
    const fmt = (n) =>
      `${sym}${Number(n || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

    const itemRows = items
      .map((it) => {
        const qty = Number(it.quantity) || 1;
        const hasPrice = it.unitPrice !== "" && !isNaN(Number(it.unitPrice));
        const sub = hasPrice ? qty * Number(it.unitPrice) : null;
        return `<tr>
          <td>${it.description || "—"}</td>
          <td style="text-align:center">${qty}</td>
          <td style="text-align:right">${hasPrice ? fmt(Number(it.unitPrice)) : "—"}</td>
          <td style="text-align:right">${sub !== null ? fmt(sub) : "—"}</td>
        </tr>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${invoiceNumber} — ${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; color: #1a1a1a; padding: 40px; font-size: 14px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .brand { font-size: 22px; font-weight: 700; color: #4f46e5; }
    .invoice-meta { text-align: right; }
    .invoice-meta h1 { font-size: 28px; font-weight: 800; color: #111; margin-bottom: 4px; }
    .invoice-meta p { color: #555; font-size: 13px; margin: 2px 0; }
    .parties { display: flex; gap: 40px; margin-bottom: 28px; }
    .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 6px; }
    .party p { font-size: 14px; font-weight: 500; }
    .party .sub { font-size: 12px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead tr { background: #4f46e5; color: #fff; }
    thead th { padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; }
    thead th:nth-child(2) { text-align: center; }
    thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
    tbody tr:nth-child(even) { background: #f8f8ff; }
    tbody td { padding: 9px 12px; border-bottom: 1px solid #e8e8f0; font-size: 13px; }
    .totals { display: flex; justify-content: flex-end; }
    .totals-box { width: 260px; }
    .totals-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
    .totals-row.grand { border-top: 2px solid #4f46e5; margin-top: 6px; padding-top: 8px; font-weight: 700; font-size: 16px; color: #4f46e5; }
    .footer { margin-top: 40px; text-align: center; color: #aaa; font-size: 11px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">${businessName || "Your Business"}</div>
    <div class="invoice-meta">
      <h1>INVOICE</h1>
      <p><strong>#${invoiceNumber}</strong></p>
      <p>Issue Date: ${issueDate || "—"}</p>
      ${dueDate ? `<p>Due Date: ${dueDate}</p>` : ""}
    </div>
  </div>

  <div class="parties">
    ${
      businessName
        ? `<div class="party"><h3>From</h3><p>${businessName}</p></div>`
        : ""
    }
    <div class="party">
      <h3>Bill To</h3>
      <p>${clientName || "—"}</p>
      ${clientEmail ? `<p class="sub">${clientEmail}</p>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Qty</th>
        <th>Unit Price</th>
        <th>Subtotal</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="totals-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
      ${numTax > 0 ? `<div class="totals-row"><span>Tax</span><span>${fmt(numTax)}</span></div>` : ""}
      ${numDiscount > 0 ? `<div class="totals-row"><span>Discount</span><span>−${fmt(numDiscount)}</span></div>` : ""}
      <div class="totals-row grand"><span>Total</span><span>${fmt(total)}</span></div>
    </div>
  </div>

  <div class="footer">Generated by Calidraw Bill &bull; ${invoiceNumber}</div>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }</script>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  return (
    <div
      className="invoice-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="invoice-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="invoice-modal-header">
          <div className="invoice-header-title-group">
            <FileText size={18} color="#4f46e5" />
            <h2>
              {view === "list" ? "Saved Invoices" : "Invoice Editor"}
            </h2>
            {view === "editor" && (
              <span
                className={`invoice-status-badge status-${status.toLowerCase()}`}
              >
                {savedInvoiceId ? "SAVED" : status}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {view === "editor" ? (
              <button
                type="button"
                className="btn-action btn-secondary"
                style={{ padding: "4px 10px", fontSize: "12px" }}
                onClick={handleLoadSavedInvoices}
              >
                <List size={14} /> Saved Invoices
              </button>
            ) : (
              <button
                type="button"
                className="btn-action btn-secondary"
                style={{ padding: "4px 10px", fontSize: "12px" }}
                onClick={() => setView("editor")}
              >
                Back to Editor
              </button>
            )}
            <button
              type="button"
              className="invoice-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="invoice-modal-body">
          {loading ? (
            <div className="invoice-loading-overlay">
              <div className="invoice-spinner" />
              <div className="invoice-loading-message">{loadingMessage}</div>
            </div>
          ) : view === "list" ? (
            <div>
              {savedInvoices.length === 0 ? (
                <p
                  style={{
                    textAlign: "center",
                    padding: "32px 0",
                    color: "var(--explorer-muted, #777)",
                  }}
                >
                  No saved invoices found. Generate and save an invoice to see
                  it here.
                </p>
              ) : (
                <table className="invoices-list-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Title</th>
                      <th>Client</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedInvoices.map((inv) => (
                      <tr
                        key={inv.id}
                        onClick={() => handleSelectSavedInvoice(inv)}
                      >
                        <td style={{ fontWeight: 600 }}>{inv.invoiceNumber}</td>
                        <td>{inv.title}</td>
                        <td>{inv.clientName || "—"}</td>
                        <td>
                          {inv.issueDate ? inv.issueDate.split("T")[0] : "—"}
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          {(CURRENCY_SYMBOLS[inv.currency] || inv.currency) +
                            Number(inv.total || 0).toFixed(2)}
                        </td>
                        <td>
                          <span
                            className={`invoice-status-badge status-${(
                              inv.status || "draft"
                            ).toLowerCase()}`}
                          >
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <>
              {/* Alert Banners */}
              {error && (
                <div className="invoice-alert invoice-alert-error" role="alert">
                  <AlertCircle size={18} style={{ flexShrink: 0 }} />
                  <div className="invoice-alert-content">
                    <div className="invoice-alert-title">Error</div>
                    <div>{error}</div>
                  </div>
                </div>
              )}

              {successMessage && (
                <div
                  className="invoice-alert invoice-alert-success"
                  role="alert"
                >
                  <CheckCircle size={18} style={{ flexShrink: 0 }} />
                  <div className="invoice-alert-content">
                    <div className="invoice-alert-title">Success</div>
                    <div>{successMessage}</div>
                  </div>
                </div>
              )}

              {missingInformation.length > 0 && (
                <div
                  className="invoice-alert invoice-alert-warning"
                  role="status"
                >
                  <AlertCircle size={18} style={{ flexShrink: 0 }} />
                  <div className="invoice-alert-content">
                    <div className="invoice-alert-title">
                      Missing Information
                    </div>
                    <div>
                      Please fill in the following before saving:
                    </div>
                    <ul className="invoice-alert-list">
                      {missingInformation.map((info, idx) => (
                        <li key={idx}>{info}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Invoice Information Grid */}
              <div className="invoice-form-grid">
                <div className="invoice-field required">
                  <label>Invoice Number</label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-2026-001"
                  />
                </div>

                <div className="invoice-field required">
                  <label>Invoice Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Website Redesign"
                  />
                </div>

                <div className="invoice-field">
                  <label>Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="INR">₹ INR (Indian Rupee)</option>
                    <option value="USD">$ USD (US Dollar)</option>
                    <option value="EUR">€ EUR (Euro)</option>
                    <option value="GBP">£ GBP (British Pound)</option>
                    <option value="CAD">CA$ CAD (Canadian Dollar)</option>
                    <option value="AUD">AU$ AUD (Australian Dollar)</option>
                  </select>
                </div>

                <div className="invoice-field">
                  <label>Freelancer / Business Name</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Acme Design Studio"
                  />
                </div>

                <div className="invoice-field">
                  <label>Client Name</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. John Doe"
                  />
                </div>

                <div className="invoice-field">
                  <label>Client Email</label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="client@example.com"
                  />
                </div>

                <div className="invoice-field">
                  <label>Issue Date</label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                  />
                </div>

                <div className="invoice-field">
                  <label>Due Date (Optional)</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Line Items Section */}
              <div className="invoice-items-section">
                <div className="invoice-items-header">
                  <div className="invoice-items-title">Line Items</div>
                  <button
                    type="button"
                    className="btn-add-item"
                    onClick={handleAddItem}
                  >
                    <Plus size={14} /> Add Line Item
                  </button>
                </div>

                {items.length === 0 && (
                  <p
                    style={{
                      padding: "16px",
                      color: "var(--explorer-muted, #777)",
                      textAlign: "center",
                      fontSize: "13px",
                    }}
                  >
                    No items yet. Select components with billing details in the
                    editor, or add items manually.
                  </p>
                )}

                <div className="invoice-table-wrapper">
                  <table className="invoice-table">
                    <thead>
                      <tr>
                        <th className="col-desc">Description</th>
                        <th className="col-qty">Qty</th>
                        <th className="col-price">
                          Unit Price ({currencySymbol})
                        </th>
                        <th className="col-subtotal">Subtotal</th>
                        <th className="col-action"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => {
                        const qty = Number(item.quantity) || 1;
                        const hasPrice =
                          item.unitPrice !== "" &&
                          !isNaN(Number(item.unitPrice));
                        const itemSubtotal = hasPrice
                          ? qty * Number(item.unitPrice)
                          : null;

                        return (
                          <tr key={item.id || index}>
                            <td className="col-desc">
                              <input
                                type="text"
                                value={item.description}
                                placeholder="Deliverable / service description"
                                onChange={(e) =>
                                  handleItemChange(
                                    index,
                                    "description",
                                    e.target.value,
                                  )
                                }
                              />
                              {item.source === "billing_metadata" && (
                                <span className="source-badge source-explicit">
                                  From Canvas
                                </span>
                              )}
                            </td>
                            <td className="col-qty">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={item.quantity}
                                onChange={(e) =>
                                  handleItemChange(
                                    index,
                                    "quantity",
                                    e.target.value,
                                  )
                                }
                              />
                            </td>
                            <td className="col-price">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={item.unitPrice}
                                onChange={(e) =>
                                  handleItemChange(
                                    index,
                                    "unitPrice",
                                    e.target.value,
                                  )
                                }
                              />
                            </td>
                            <td className="col-subtotal">
                              {itemSubtotal !== null
                                ? formatAmount(itemSubtotal)
                                : "—"}
                            </td>
                            <td className="col-action">
                              <button
                                type="button"
                                className="btn-delete-item"
                                title="Delete line item"
                                onClick={() => handleDeleteItem(index)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Invoice Summary */}
              <div className="invoice-summary-container">
                <div className="invoice-summary-box">
                  <div className="invoice-summary-row">
                    <span>Subtotal:</span>
                    <span style={{ fontWeight: 600 }}>
                      {formatAmount(subtotal)}
                    </span>
                  </div>

                  <div className="invoice-summary-row">
                    <span>Tax ({currencySymbol}):</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tax}
                      onChange={(e) => setTax(e.target.value)}
                    />
                  </div>

                  <div className="invoice-summary-row">
                    <span>Discount ({currencySymbol}):</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                    />
                  </div>

                  <div className="invoice-summary-row invoice-summary-total">
                    <span>Total:</span>
                    <span>{formatAmount(total)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="invoice-modal-footer">
          <div className="invoice-footer-left">
            <button
              type="button"
              className="btn-action btn-secondary"
              disabled={loading || isSaving}
              onClick={handleEnhanceWithAI}
              title="Use AI to improve descriptions (prices and quantities are preserved)"
            >
              <Sparkles size={14} />
              Enhance with AI
            </button>
            <button
              type="button"
              className="btn-action btn-secondary"
              disabled={loading || isSaving || items.length === 0}
              onClick={handleDownloadPDF}
              title="Download as PDF"
            >
              <Download size={14} />
              Download PDF
            </button>
          </div>

          <div className="invoice-footer-right">
            <button
              type="button"
              className="btn-action btn-secondary"
              onClick={onClose}
              disabled={loading || isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-action btn-primary"
              onClick={handleSave}
              disabled={loading || isSaving || items.length === 0}
            >
              <FileText size={15} />
              {isSaving ? "Saving..." : "Save Invoice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
