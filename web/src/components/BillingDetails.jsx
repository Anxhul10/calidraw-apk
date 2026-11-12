import { useMemo, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

const BILLING_KEY = "billing";

function getSelection(elements, appState) {
  const selectedIds = appState?.selectedElementIds ?? {};
  const selected = elements.filter((element) => selectedIds[element.id]);
  if (selected.length === 1) {
    return { elements: selected, groupId: null };
  }

  if (selected.length < 2) return null;

  const groupIds = selected.map((element) => {
    const ids = element.groupIds ?? [];
    return ids[ids.length - 1];
  });
  const groupId = groupIds[0];
  if (!groupId || groupIds.some((id) => id !== groupId)) return null;
  return { elements: selected, groupId };
}

function getBilling(selection) {
  if (!selection) return null;
  const entry = selection.elements.find(
    (element) => element.customData?.[BILLING_KEY],
  )?.customData?.[BILLING_KEY];
  return entry ?? null;
}

function BillingForm({ api, elements, selection, billing }) {
  const [description, setDescription] = useState(billing?.description ?? "");
  const [price, setPrice] = useState(
    billing?.price == null ? "" : String(billing.price),
  );
  const [quantity, setQuantity] = useState(
    billing?.quantity == null ? "1" : String(billing.quantity),
  );

  const updateBilling = (nextBilling) => {
    const selectedIds = new Set(selection.elements.map((element) => element.id));
    const billingElementId = selection.elements[0].id;
    const currentBilling = getBilling(selection);
    if (JSON.stringify(currentBilling) === JSON.stringify(nextBilling)) return;

    const nextElements = elements.map((element) => {
      if (!selectedIds.has(element.id)) return element;

      const customData = { ...(element.customData ?? {}) };
      delete customData[BILLING_KEY];
      if (nextBilling && element.id === billingElementId) {
        return {
          ...element,
          customData: { ...customData, [BILLING_KEY]: nextBilling },
        };
      }

      if (Object.keys(customData).length) return { ...element, customData };
      const nextElement = { ...element };
      delete nextElement.customData;
      return nextElement;
    });

    api.updateScene({
      elements: nextElements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const save = (event) => {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    const parsedPrice = price.trim() === "" ? null : Number(price);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return;
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      return;
    }

    updateBilling({
      description: description.trim(),
      price: parsedPrice,
      quantity: parsedQuantity,
      ...(selection.groupId ? { groupId: selection.groupId } : {}),
    });
  };

  const clear = () => updateBilling(null);

  return (
    <aside
      className="billing-details"
      aria-label="Billing Details"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="billing-details-heading">Billing Details</div>
      {selection.groupId && (
        <div className="billing-details-caption">Applied to selected group</div>
      )}
      <form onSubmit={save}>
        <label>
          Description
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="e.g. Design work"
          />
        </label>
        <div className="billing-details-row">
          <label>
            Price
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="0.00"
            />
          </label>
          <label>
            Quantity
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
        </div>
        <div className="billing-details-actions">
          <button type="submit">Save</button>
          {billing && (
            <button type="button" className="billing-details-clear" onClick={clear}>
              Clear
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}

export default function BillingDetails({ api, elements, appState }) {
  const selection = useMemo(
    () => getSelection(elements, appState),
    [elements, appState],
  );
  const billing = getBilling(selection);

  if (!api || !selection) return null;

  const formKey = JSON.stringify({
    ids: selection.elements.map((element) => element.id),
    billing,
    groupId: selection.groupId,
  });
  return (
    <BillingForm
      key={formKey}
      api={api}
      elements={elements}
      selection={selection}
      billing={billing}
    />
  );
}
