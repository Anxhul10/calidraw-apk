export default function CanvasPaidStamp({ paidData }) {
  if (!paidData || (paidData.status !== "PAID" && paidData.status !== "PARTIALLY_PAID")) {
    return null;
  }

  const isPartial = paidData.status === "PARTIALLY_PAID";
  const sym = paidData.currency === "INR" ? "₹" : "$";
  const displayDate = paidData.paymentTime ? new Date(paidData.paymentTime).toLocaleDateString() : "";

  return (
    <div className={`canvas-paid-stamp-overlay ${isPartial ? "stamp-partial" : "stamp-full"}`}>
      <div className="stamp-inner">
        <div className="stamp-title">{isPartial ? "PARTIALLY PAID" : "PAID"}</div>
        <div className="stamp-amount">
          {sym}{Number(paidData.amountPaid || 0).toFixed(2)} {paidData.currency}
        </div>
        {paidData.invoiceNumber && (
          <div className="stamp-invoice">#{paidData.invoiceNumber}</div>
        )}
        {displayDate && (
          <div className="stamp-date">{displayDate}</div>
        )}
      </div>
    </div>
  );
}
