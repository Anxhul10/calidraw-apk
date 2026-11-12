import { useState } from "react";
import {
  DollarSign,
  CheckCircle,
  XCircle,
  Pause,
  Play,
  FileText,
  CreditCard,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  Clock,
  History,
  Send,
} from "lucide-react";
import {
  createPaypalInvoiceForNegotiation,
  sendPaypalInvoiceForNegotiation,
} from "../services/negotiationApi";

export default function NegotiationOverlay({
  negotiation,
  role, // "host" | "collaborator"
  socket,
  onHighlightElements,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [counterInputOpen, setCounterInputOpen] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [raiseInputOpen, setRaiseInputOpen] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState("");
  const [raiseMessage, setRaiseMessage] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sellerName, setSellerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  if (!negotiation) return null;

  const isHost = role === "host";
  const isCollaborator = role === "collaborator";
  const { status, currency, offers = [], selectedElementIds = [] } = negotiation;
  const currentOffer = offers[offers.length - 1] || null;
  const currencySymbol = currency === "INR" ? "₹" : "$";

  // Actions
  const handleAcceptOffer = () => {
    if (!socket || !currentOffer) return;
    socket.emit("payment:accept", {
      negotiationId: negotiation.negotiationId,
      offerId: currentOffer.offerId,
    });
  };

  const handleSendCounterOffer = (e) => {
    e.preventDefault();
    if (!socket || !counterAmount) return;
    const amt = parseFloat(counterAmount);
    if (isNaN(amt) || amt <= 0) return;

    socket.emit("payment:counteroffer", {
      negotiationId: negotiation.negotiationId,
      senderName: isHost ? negotiation.hostName : (negotiation.collaboratorName || "Collaborator"),
      amount: amt,
      message: counterMessage.trim(),
    });

    setCounterInputOpen(false);
    setCounterAmount("");
    setCounterMessage("");
  };

  const handleSendRaiseOffer = (e) => {
    e.preventDefault();
    if (!socket || !raiseAmount) return;
    const amt = parseFloat(raiseAmount);
    if (isNaN(amt) || amt <= 0) return;

    socket.emit("payment:raise", {
      negotiationId: negotiation.negotiationId,
      amount: amt,
      message: raiseMessage.trim(),
    });

    setRaiseInputOpen(false);
    setRaiseAmount("");
    setRaiseMessage("");
  };

  const handleHoldToggle = () => {
    if (!socket) return;
    if (status === "ON_HOLD") {
      socket.emit("payment:resume", { negotiationId: negotiation.negotiationId });
    } else {
      socket.emit("payment:hold", { negotiationId: negotiation.negotiationId });
    }
  };

  const handleCancel = () => {
    if (!socket) return;
    if (window.confirm("Are you sure you want to cancel this deal negotiation?")) {
      socket.emit("payment:cancel", {
        negotiationId: negotiation.negotiationId,
        reason: isHost ? "Cancelled by host" : "Declined by collaborator",
      });
    }
  };

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setStatusMessage("Creating PayPal Invoice...");

    try {
      await createPaypalInvoiceForNegotiation(negotiation.negotiationId, {
        sellerName: sellerName.trim() || negotiation.hostName || "Host Seller",
        customerEmail: customerEmail.trim(),
        customerName: negotiation.collaboratorName || "Customer",
        senderSocketId: socket?.id,
      });

      setStatusMessage("PayPal Invoice Created! You can now send it to the client.");
      setInvoiceModalOpen(false);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to create PayPal invoice");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendInvoice = async () => {
    setIsProcessing(true);
    setStatusMessage("Sending PayPal Invoice...");

    try {
      await sendPaypalInvoiceForNegotiation(negotiation.negotiationId, {
        senderSocketId: socket?.id,
      });
      setStatusMessage("Invoice sent! Waiting for collaborator payment.");
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to send PayPal invoice");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInspectElements = () => {
    if (onHighlightElements && selectedElementIds.length > 0) {
      onHighlightElements(selectedElementIds);
    }
  };

  // Status badge styling
  const getStatusBadge = () => {
    switch (status) {
      case "OFFER_REQUESTED":
        return <span className="neg-badge neg-badge-req">OFFER REQUESTED</span>;
      case "COUNTEROFFER_RECEIVED":
        return <span className="neg-badge neg-badge-counter">COUNTEROFFER</span>;
      case "ON_HOLD":
        return <span className="neg-badge neg-badge-hold">ON HOLD</span>;
      case "AGREED":
        return <span className="neg-badge neg-badge-agreed">DEAL AGREED</span>;
      case "INVOICE_CREATED":
        return <span className="neg-badge neg-badge-inv">INVOICE CREATED</span>;
      case "PAYMENT_PENDING":
        return <span className="neg-badge neg-badge-pending">PAYMENT PENDING</span>;
      case "PAID":
        return <span className="neg-badge neg-badge-paid">PAID</span>;
      case "PARTIALLY_PAID":
        return <span className="neg-badge neg-badge-paid">PARTIALLY PAID</span>;
      case "CANCELLED":
        return <span className="neg-badge neg-badge-cancelled">CANCELLED</span>;
      default:
        return <span className="neg-badge">{status}</span>;
    }
  };

  return (
    <div className={`negotiation-floating-card ${collapsed ? "collapsed" : ""}`}>
      {/* Header */}
      <div className="neg-card-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="neg-card-title-group">
          <DollarSign size={18} className="neg-icon-accent" />
          <span className="neg-card-title">Live Deal & Payment</span>
          {getStatusBadge()}
        </div>
        <div className="neg-card-controls">
          <span className="neg-role-indicator">{isHost ? "Host" : "Collaborator"}</span>
          <button type="button" className="neg-toggle-btn" aria-label="Toggle card">
            {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="neg-card-body">
          {/* Main summary row */}
          <div className="neg-amount-display">
            <div className="neg-amount-label">
              {status === "AGREED" || status === "INVOICE_CREATED" || status === "PAYMENT_PENDING" || status === "PAID"
                ? "Agreed Deal Amount:"
                : currentOffer?.senderRole === "collaborator"
                ? "Counteroffer Amount:"
                : "Requested Amount:"}
            </div>
            <div className="neg-amount-val">
              {currencySymbol}{Number(currentOffer?.amount || negotiation.agreedAmount || 0).toFixed(2)} {currency}
            </div>
          </div>

          {currentOffer?.message && (
            <div className="neg-offer-message">
              <strong>{currentOffer.senderRole === "host" ? "Host" : "Collaborator"}:</strong> "{currentOffer.message}"
            </div>
          )}

          {/* Quick link to highlight selected elements */}
          {selectedElementIds.length > 0 && (
            <button type="button" className="neg-inspect-btn" onClick={handleInspectElements}>
              <ArrowUpRight size={14} /> Highlight {selectedElementIds.length} related element(s)
            </button>
          )}

          {/* Item details accordion toggle */}
          {currentOffer?.items && currentOffer.items.length > 0 && (
            <div className="neg-items-list">
              <div className="neg-items-summary">
                {currentOffer.items.map((it, idx) => (
                  <div key={idx} className="neg-item-row">
                    <span>{it.quantity}x {it.description}</span>
                    <span>{currencySymbol}{(it.subtotal || it.unitPrice * it.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Negotiation status messages */}
          {statusMessage && <div className="neg-status-feedback">{statusMessage}</div>}

          {/* Active Status & Action Area */}
          <div className="neg-actions-area">
            {/* 1. Collaborator view when host requested offer */}
            {isCollaborator && (status === "OFFER_REQUESTED" || (status === "COUNTEROFFER_RECEIVED" && currentOffer?.senderRole === "host")) && (
              <div className="neg-button-group">
                <button type="button" className="btn-neg-accept" onClick={handleAcceptOffer}>
                  <CheckCircle size={15} /> Accept Offer
                </button>
                <button
                  type="button"
                  className="btn-neg-counter"
                  onClick={() => setCounterInputOpen(!counterInputOpen)}
                >
                  <DollarSign size={15} /> Counter Offer
                </button>
                <button type="button" className="btn-neg-decline" onClick={handleCancel}>
                  <XCircle size={15} /> Decline
                </button>
              </div>
            )}

            {/* 2. Host view when collaborator made counteroffer */}
            {isHost && status === "COUNTEROFFER_RECEIVED" && currentOffer?.senderRole === "collaborator" && (
              <div className="neg-button-group">
                <button type="button" className="btn-neg-accept" onClick={handleAcceptOffer}>
                  <CheckCircle size={15} /> Accept Counteroffer
                </button>
                <button
                  type="button"
                  className="btn-neg-raise"
                  onClick={() => setRaiseInputOpen(!raiseInputOpen)}
                >
                  Raise / New Offer
                </button>
                <button type="button" className="btn-neg-decline" onClick={handleCancel}>
                  <XCircle size={15} /> Reject & Cancel
                </button>
              </div>
            )}

            {/* Waiting indicators */}
            {isHost && status === "OFFER_REQUESTED" && (
              <div className="neg-waiting-hint">
                <Clock size={14} /> Waiting for collaborator response...
              </div>
            )}
            {isCollaborator && status === "COUNTEROFFER_RECEIVED" && currentOffer?.senderRole === "collaborator" && (
              <div className="neg-waiting-hint">
                <Clock size={14} /> Counteroffer submitted! Waiting for host...
              </div>
            )}
            {status === "ON_HOLD" && (
              <div className="neg-hold-notice">
                <Pause size={14} /> Negotiation is currently on hold.
              </div>
            )}

            {/* Counteroffer Input Box */}
            {counterInputOpen && (
              <form onSubmit={handleSendCounterOffer} className="neg-sub-form">
                <label>Propose New Amount ({currencySymbol}):</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={counterAmount}
                  onChange={(e) => setCounterAmount(e.target.value)}
                  placeholder="e.g. 250"
                  required
                  autoFocus
                />
                <input
                  type="text"
                  value={counterMessage}
                  onChange={(e) => setCounterMessage(e.target.value)}
                  placeholder="Optional reason for counteroffer"
                />
                <div className="neg-form-actions">
                  <button type="button" onClick={() => setCounterInputOpen(false)}>Cancel</button>
                  <button type="submit" className="btn-sub-send">Submit Counter</button>
                </div>
              </form>
            )}

            {/* Raise Price Input Box */}
            {raiseInputOpen && (
              <form onSubmit={handleSendRaiseOffer} className="neg-sub-form">
                <label>New Proposed Price ({currencySymbol}):</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={raiseAmount}
                  onChange={(e) => setRaiseAmount(e.target.value)}
                  placeholder="e.g. 350"
                  required
                  autoFocus
                />
                <input
                  type="text"
                  value={raiseMessage}
                  onChange={(e) => setRaiseMessage(e.target.value)}
                  placeholder="Optional message to client"
                />
                <div className="neg-form-actions">
                  <button type="button" onClick={() => setRaiseInputOpen(false)}>Cancel</button>
                  <button type="submit" className="btn-sub-send">Send Price</button>
                </div>
              </form>
            )}

            {/* Host Controls: Hold / Resume / Cancel */}
            {isHost && status !== "AGREED" && status !== "PAID" && status !== "CANCELLED" && (
              <div className="neg-host-subcontrols">
                <button type="button" className="btn-subcontrol" onClick={handleHoldToggle}>
                  {status === "ON_HOLD" ? <><Play size={12} /> Resume</> : <><Pause size={12} /> Hold</>}
                </button>
                <button type="button" className="btn-subcontrol btn-subcontrol-danger" onClick={handleCancel}>
                  Cancel Deal
                </button>
              </div>
            )}

            {/* AGREED state: Host creates PayPal Invoice */}
            {status === "AGREED" && isHost && (
              <div className="neg-agreed-box">
                <p>Both parties agreed on {currencySymbol}{negotiation.agreedAmount?.toFixed(2)}!</p>
                <button
                  type="button"
                  className="btn-paypal-invoice"
                  onClick={() => setInvoiceModalOpen(true)}
                  disabled={isProcessing}
                >
                  <FileText size={15} /> Create PayPal Invoice
                </button>
              </div>
            )}

            {/* AGREED state: Collaborator waiting for invoice */}
            {status === "AGREED" && isCollaborator && (
              <div className="neg-agreed-box">
                <CheckCircle size={20} color="#10b981" />
                <p>Deal agreed at {currencySymbol}{negotiation.agreedAmount?.toFixed(2)}! Waiting for host to create invoice...</p>
              </div>
            )}

            {/* INVOICE_CREATED: Host sends to client */}
            {status === "INVOICE_CREATED" && isHost && (
              <div className="neg-agreed-box">
                <p>Invoice #{negotiation.invoice?.invoiceNumber || "DRAFT"} created!</p>
                <button
                  type="button"
                  className="btn-paypal-invoice"
                  onClick={handleSendInvoice}
                  disabled={isProcessing}
                >
                  <Send size={15} /> Send Invoice to Collaborator
                </button>
              </div>
            )}

            {/* PAYMENT_PENDING: Collaborator pays via PayPal */}
            {status === "PAYMENT_PENDING" && isCollaborator && (
              <div className="neg-payment-box">
                <p>PayPal Invoice #{negotiation.invoice?.invoiceNumber} is ready for payment.</p>
                {negotiation.invoice?.recipientViewUrl ? (
                  <a
                    href={negotiation.invoice.recipientViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-paypal-pay"
                  >
                    <CreditCard size={15} /> Pay with PayPal ({currencySymbol}{negotiation.agreedAmount?.toFixed(2)})
                  </a>
                ) : (
                  <p style={{ color: "#777", fontSize: "12px" }}>Waiting for invoice payment link...</p>
                )}
              </div>
            )}

            {/* PAYMENT_PENDING: Host waiting for collaborator to pay */}
            {status === "PAYMENT_PENDING" && isHost && (
              <div className="neg-waiting-hint">
                <Clock size={14} /> Invoice sent! Awaiting verified PayPal payment confirmation...
              </div>
            )}

            {/* PAID confirmation stamp display */}
            {(status === "PAID" || status === "PARTIALLY_PAID") && (
              <div className="neg-paid-stamp-box">
                <div className="neg-paid-stamp-badge">
                  {status === "PARTIALLY_PAID" ? "PARTIALLY PAID" : "PAID"}
                </div>
                <div className="neg-paid-details">
                  <span>Amount: {currencySymbol}{negotiation.agreedAmount?.toFixed(2)} {currency}</span>
                  {negotiation.invoice?.invoiceNumber && <span>Invoice: #{negotiation.invoice.invoiceNumber}</span>}
                  {negotiation.invoice?.paidAt && (
                    <span>Confirmed: {new Date(negotiation.invoice.paidAt).toLocaleTimeString()}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Offer History Toggle */}
          <div className="neg-history-section">
            <button
              type="button"
              className="neg-history-toggle"
              onClick={() => setHistoryOpen(!historyOpen)}
            >
              <History size={14} /> Negotiation History ({offers.length} offers)
            </button>
            {historyOpen && (
              <div className="neg-history-list">
                {offers.map((off, idx) => (
                  <div key={off.offerId || idx} className={`neg-history-item sender-${off.senderRole}`}>
                    <div className="neg-hist-header">
                      <span className="neg-hist-sender">{off.senderName} ({off.senderRole})</span>
                      <span className="neg-hist-amount">{currencySymbol}{off.amount.toFixed(2)}</span>
                    </div>
                    {off.message && <div className="neg-hist-msg">"{off.message}"</div>}
                    <div className="neg-hist-date">{new Date(off.createdAt).toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invoice Creation Form Modal */}
      {invoiceModalOpen && (
        <div className="payment-modal-overlay" onClick={() => setInvoiceModalOpen(false)}>
          <div className="payment-modal" onClick={(e) => e.stopPropagation()}>
            <div className="payment-modal-header">
              <h2>Finalize PayPal Invoice</h2>
              <button type="button" onClick={() => setInvoiceModalOpen(false)}><XCircle size={18} /></button>
            </div>
            <form onSubmit={handleCreateInvoice}>
              <div className="payment-modal-body">
                <div className="payment-field-group">
                  <label>Business / Seller Name</label>
                  <input
                    type="text"
                    value={sellerName}
                    onChange={(e) => setSellerName(e.target.value)}
                    placeholder={negotiation.hostName || "Your business name"}
                  />
                </div>
                <div className="payment-field-group">
                  <label>Client / Buyer Email (Required for PayPal)</label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="client@example.com"
                    required
                  />
                </div>
                <div className="payment-subtotal-bar">
                  <span>Agreed Invoice Total:</span>
                  <span className="payment-subtotal-val">{currencySymbol}{negotiation.agreedAmount?.toFixed(2)} {currency}</span>
                </div>
              </div>
              <div className="payment-modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setInvoiceModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isProcessing}>
                  {isProcessing ? "Generating..." : "Create PayPal Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
