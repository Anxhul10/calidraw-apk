
import { useMemo, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { FileText } from "lucide-react";

const BILLING_KEY = "billing";

function getSelection(elements, appState) {
  const selectedIds = appState?.selectedElementIds ?? {};

  const selected = elements.filter(
    (element) => selectedIds[element.id] && !element.isDeleted,
  );

  if (selected.length === 0) return null;

  return {
    elements: selected,
    isMultiSelection: selected.length > 1,
    groupId:
      selected.length === 1
        ? selected[0].groupIds?.at(-1) ?? null
        : null,
  };
}

function getBilling(selection) {
  if (!selection) return null;

  return (
    selection.elements.find(
      (element) => element.customData?.[BILLING_KEY],
    )?.customData?.[BILLING_KEY] ?? null
  );
}

/** Collects ALL billing records from a selection (one per owner element). */
function getAllBillingItems(selection) {
  if (!selection) return [];
  const seen = new Set();
  const items = [];
  for (const element of selection.elements) {
    const b = element.customData?.[BILLING_KEY];
    if (!b || seen.has(element.id)) continue;
    // Only the owner element carries the canonical billing record
    if (b.ownerElementId && b.ownerElementId !== element.id) continue;
    seen.add(element.id);
    items.push({
      componentId: element.id,
      description: b.description || "",
      quantity: b.quantity ?? 1,
      unitPrice: typeof b.price === "number" ? b.price : null,
      currency: b.currency || "INR",
    });
  }
  return items;
}

function BillingForm({
  api,
  elements,
  selection,
  billing,
  billingItems,
  onGenerateInvoice,
}) {
  const [description, setDescription] = useState(
    billing?.description ?? "",
  );

  const [currency, setCurrency] = useState(
    billing?.currency ?? "INR",
  );

  const [price, setPrice] = useState(
    billing?.price == null ? "" : String(billing.price),
  );

  const [quantity, setQuantity] = useState(
    billing?.quantity == null ? "1" : String(billing.quantity),
  );

  const [error, setError] = useState("");

  const selectedIds = new Set(
    selection.elements.map((element) => element.id),
  );

  const updateBilling = (nextBilling) => {
    const existingBillingElements = selection.elements.filter(
      (element) => element.customData?.[BILLING_KEY],
    );

    // Avoid silently replacing another billing record.
    if (
      nextBilling &&
      existingBillingElements.some(
        (element) =>
          element.id !== billing?.ownerElementId &&
          JSON.stringify(element.customData?.[BILLING_KEY]) !==
            JSON.stringify(billing),
      )
    ) {
      setError(
        "Some selected elements already have billing details. Select them separately or clear their existing billing first.",
      );
      return;
    }

    const billingElementId = nextBilling
      ? billing?.ownerElementId &&
        selectedIds.has(billing.ownerElementId)
        ? billing.ownerElementId
        : selection.elements[0].id
      : null;

    const nextElements = elements.map((element) => {
      if (!selectedIds.has(element.id)) return element;

      const customData = { ...(element.customData ?? {}) };
      delete customData[BILLING_KEY];

      if (nextBilling && element.id === billingElementId) {
        return {
          ...element,
          customData: {
            ...customData,
            [BILLING_KEY]: {
              ...nextBilling,
              ownerElementId: billingElementId,
              elementIds: selection.elements.map((item) => item.id),
            },
          },
        };
      }

      if (Object.keys(customData).length > 0) {
        return {
          ...element,
          customData,
        };
      }

      const nextElement = { ...element };
      delete nextElement.customData;
      return nextElement;
    });

    api.updateScene({
      elements: nextElements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    setError("");
  };

  const save = (event) => {
    event.preventDefault();
    setError("");

    const parsedQuantity = Number(quantity);
    const parsedPrice =
      price.trim() === "" ? null : Number(price);

    if (
      !Number.isFinite(parsedQuantity) ||
      parsedQuantity <= 0
    ) {
      setError("Enter a valid quantity greater than zero.");
      return;
    }

    if (
      parsedPrice !== null &&
      (!Number.isFinite(parsedPrice) || parsedPrice < 0)
    ) {
      setError("Enter a valid price.");
      return;
    }

    updateBilling({
      description: description.trim(),
      price: parsedPrice,
      quantity: parsedQuantity,
      currency,
    });
  };

  const clear = () => {
    updateBilling(null);
    setDescription("");
    setPrice("");
    setQuantity("1");
    setError("");
  };

  return (
    <aside
      className="billing-details"
      aria-label="Billing Details"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="billing-details-heading">
        Billing Details
      </div>

      <div className="billing-details-caption">
        {selection.isMultiSelection
          ? `${selection.elements.length} elements selected`
          : selection.groupId
            ? "Single element selected"
            : "Single element selected"}
      </div>

      <form onSubmit={save}>
        <label>
          Description
          <input
            value={description}
            onChange={(event) =>
              setDescription(event.target.value)
            }
            placeholder="e.g. Complete logo design"
          />
        </label>

        <label>
          Price
          <div className="billing-price-input">
            <select
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value)
              }
            >
              <option value="INR">₹ INR</option>
              <option value="USD">$ USD</option>
            </select>

            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) =>
                setPrice(event.target.value)
              }
              placeholder="0.00"
            />
          </div>
        </label>

        <label>
          Quantity
          <input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(event) =>
              setQuantity(event.target.value)
            }
          />
        </label>

        {error && (
          <div className="billing-details-error" role="alert">
            {error}
          </div>
        )}

        <div className="billing-details-actions">
          <button type="submit">Save</button>

          {billing && (
            <button
              type="button"
              className="billing-details-clear"
              onClick={clear}
            >
              Clear
            </button>
          )}
        </div>

        {onGenerateInvoice && billingItems.length > 0 && (
          <button
            type="button"
            className="billing-generate-invoice-btn"
            onClick={() => onGenerateInvoice(billingItems)}
          >
            <FileText size={14} />
            Generate Invoice
          </button>
        )}
      </form>
    </aside>
  );
}

export default function BillingDetails({
  api,
  elements,
  appState,
  onGenerateInvoice,
}) {
  const selection = useMemo(
    () => getSelection(elements, appState),
    [elements, appState],
  );

  const billing = getBilling(selection);
  const billingItems = useMemo(
    () => getAllBillingItems(selection),
    [selection],
  );

  if (!api || !selection) return null;

  const formKey = JSON.stringify({
    ids: selection.elements.map((element) => element.id),
    billing,
  });

  return (
    <BillingForm
      key={formKey}
      api={api}
      elements={elements}
      selection={selection}
      billing={billing}
      billingItems={billingItems}
      onGenerateInvoice={onGenerateInvoice}
    />
  );
}
