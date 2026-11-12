import { useState } from "react";
import { DollarSign, X, Plus, Trash2, Send } from "lucide-react";

export default function PaymentRequestModal({
  isOpen,
  onClose,
  initialItems,
  selectedElements,
  currency: initialCurrency = "USD",
  onSubmit,
}) {
  const [currency, setCurrency] = useState(initialCurrency);
  const [items, setItems] = useState(() => {
    if (initialItems && initialItems.length > 0) {
      return initialItems.map((item, idx) => ({
        id: `item_${Date.now()}_${idx}`,
        componentId: item.componentId || selectedElements?.[idx]?.id || `el_${idx}`,
        description: item.description || `Item ${idx + 1}`,
        quantity: Math.max(1, Number(item.quantity) || 1),
        unitPrice: item.unitPrice != null ? Number(item.unitPrice) : 0,
      }));
    }
    // Fallback if elements had no billing metadata
    return (selectedElements || []).map((el, idx) => ({
      id: `item_${Date.now()}_${idx}`,
      componentId: el.id,
      description: el.text || `Drawing Element ${idx + 1}`,
      quantity: 1,
      unitPrice: 0,
    }));
  });

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}_${prev.length}`,
        componentId: `custom_${Date.now()}`,
        description: "",
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  };

  const handleDeleteItem = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, it) => {
      const q = Number(it.quantity) || 0;
      const p = Number(it.unitPrice) || 0;
      return sum + q * p;
    }, 0);
  };

  const subtotal = calculateSubtotal();

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (items.length === 0) {
      setError("Please add at least one line item.");
      return;
    }

    for (const it of items) {
      if (!it.description.trim()) {
        setError("All items must have a description.");
        return;
      }
      if (Number(it.quantity) <= 0) {
        setError("Quantities must be greater than zero.");
        return;
      }
      if (Number(it.unitPrice) < 0) {
        setError("Prices cannot be negative.");
        return;
      }
    }

    onSubmit({
      items: items.map((it) => ({
        componentId: it.componentId,
        description: it.description.trim(),
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        subtotal: Number(it.quantity) * Number(it.unitPrice),
      })),
      currency,
      message: message.trim(),
      selectedElementIds: (selectedElements || []).map((el) => el.id),
    });

    onClose();
  };

  const currencySymbol = currency === "INR" ? "₹" : "$";

  return (
    <div className="payment-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="payment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="payment-modal-header">
          <div className="payment-header-title">
            <DollarSign size={20} color="#10b981" />
            <h2>Request Payment from Collaborators</h2>
          </div>
          <button type="button" className="payment-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="payment-modal-body">
            <p className="payment-modal-desc">
              Review and adjust proposed deliverables and pricing. Collaborators will receive an instant live offer on canvas.
            </p>

            <div className="payment-field-group">
              <label>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD ($)</option>
                <option value="INR">INR (₹)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>

            <div className="payment-items-header">
              <label>Line Items</label>
              <button type="button" className="btn-add-item-small" onClick={handleAddItem}>
                <Plus size={14} /> Add Item
              </button>
            </div>

            <div className="payment-items-table-wrapper">
              <table className="payment-items-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th style={{ width: "70px" }}>Qty</th>
                    <th style={{ width: "110px" }}>Price ({currencySymbol})</th>
                    <th style={{ width: "90px" }}>Subtotal</th>
                    <th style={{ width: "36px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const q = Number(it.quantity) || 0;
                    const p = Number(it.unitPrice) || 0;
                    const itemSub = q * p;
                    return (
                      <tr key={it.id || idx}>
                        <td>
                          <input
                            type="text"
                            value={it.description}
                            onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                            placeholder="e.g. Logo wireframe"
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={it.quantity}
                            onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={it.unitPrice}
                            onChange={(e) => handleItemChange(idx, "unitPrice", e.target.value)}
                            required
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          {currencySymbol}{itemSub.toFixed(2)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-delete-row"
                            onClick={() => handleDeleteItem(idx)}
                            title="Remove item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="payment-field-group" style={{ marginTop: "14px" }}>
              <label>Optional Note / Message to Collaborator</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Milestone 1 design deliverables ready for payment"
                rows={2}
              />
            </div>

            {error && <div className="payment-error-banner">{error}</div>}

            <div className="payment-subtotal-bar">
              <span>Total Requested Amount:</span>
              <span className="payment-subtotal-val">{currencySymbol}{subtotal.toFixed(2)} {currency}</span>
            </div>
          </div>

          <div className="payment-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={items.length === 0}>
              <Send size={15} /> Send Payment Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
