import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Excalidraw,
  MainMenu,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import { FolderOpen } from "lucide-react";

import { editor, parseScene } from "../editorState";
import { storage } from "../storage";
import BillingDetails from "./BillingDetails";
import InvoiceModal from "./InvoiceModal";
import PaymentRequestModal from "./PaymentRequestModal";
import NegotiationOverlay from "./NegotiationOverlay";
import CanvasPaidStamp from "./CanvasPaidStamp";
import { fetchNegotiationState } from "../services/negotiationApi";
import "../InvoiceModal.css";
import "../Negotiation.css";

function getSelectionSignature(elements, appState) {
  const selectedIds = appState?.selectedElementIds ?? {};
  const ids = Object.keys(selectedIds)
    .filter((id) => selectedIds[id])
    .sort();

  return JSON.stringify(
    ids.map((id) => {
      const element = elements.find((candidate) => candidate.id === id);
      return [
        id,
        element?.version ?? null,
        element?.versionNonce ?? null,
        element?.groupIds ?? null,
        element?.customData?.billing ?? null,
      ];
    }),
  );
}

export default function DrawingEditor({
  fileName,
  onThemeChange,
  onOpenExplorer,
  explorer,
}) {
  const initialData = useMemo(() => parseScene(storage.read(fileName)), [fileName]);
  const timerRef = useRef(null);
  const latestRef = useRef(null);
  const flushRef = useRef(() => {});
  const [api, setApi] = useState(null);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceBillingItems, setInvoiceBillingItems] = useState([]);
  const [collabController, setCollabController] = useState(null);
  const [liveSocket, setLiveSocket] = useState(null);
  const [liveRoomId, setLiveRoomId] = useState(null);
  const [participantRole, setParticipantRole] = useState("unknown");
  const [paymentRequestModalOpen, setPaymentRequestModalOpen] = useState(false);
  const [requestPaymentItems, setRequestPaymentItems] = useState([]);
  const [requestPaymentElements, setRequestPaymentElements] = useState([]);
  const [negotiation, setNegotiation] = useState(null);
  const [paidStampData, setPaidStampData] = useState(null);
  const [selection, setSelection] = useState({
    elements: initialData?.elements ?? [],
    appState: initialData?.appState ?? null,
  });
  const selectionSignatureRef = useRef(
    getSelectionSignature(selection.elements, selection.appState),
  );

  const handleGenerateInvoice = (billingItems) => {
    setInvoiceBillingItems(billingItems);
    setInvoiceModalOpen(true);
  };

  const handleOpenPaymentRequest = (billingItems, elements) => {
    setParticipantRole("host");
    setRequestPaymentItems(billingItems);
    setRequestPaymentElements(elements);
    setPaymentRequestModalOpen(true);
  };

  const handleHighlightElements = useCallback((elementIds) => {
    if (!api || !elementIds || elementIds.length === 0) return;
    const idMap = {};
    elementIds.forEach((id) => { idMap[id] = true; });
    api.updateScene({
      appState: {
        selectedElementIds: idMap,
      },
    });
  }, [api]);

  // Listen to collaboration controller and socket events
  useEffect(() => {
    if (!collabController) return undefined;

    const unsubRole = collabController.onRoleChange((role) => {
      setParticipantRole(role);
    });

    let cleanupSocket = () => {};

    const unsubSocket = collabController.onSocketChange((socket, roomId) => {
      cleanupSocket();
      setLiveSocket(socket);
      setLiveRoomId(roomId);

      if (!socket || !roomId) {
        return;
      }

      console.log(`[DrawingEditor] Attaching Socket.IO listeners for room: ${roomId}, socket id: ${socket.id}`);

      // Reconcile and fetch latest state from backend for this room
      fetchNegotiationState(roomId)
        .then((neg) => {
          if (neg) {
            setNegotiation(neg);
            if (neg.status === "PAID" || neg.status === "PARTIALLY_PAID") {
              setPaidStampData({
                status: neg.status,
                amountPaid: neg.agreedAmount,
                currency: neg.currency,
                invoiceNumber: neg.invoice?.invoiceNumber,
                paymentTime: neg.invoice?.paidAt,
              });
            }
          }
        })
        .catch(console.error);

      // Event handlers with room validation
      const handleOffer = (data) => {
        if (!data?.negotiation || data.negotiation.roomId !== roomId) return;
        console.log(`[DrawingEditor] Received payment:offer | Room: ${roomId} | Status: ${data.negotiation.status}`);
        setNegotiation(data.negotiation);
      };

      const handleRequestSent = (data) => {
        if (!data?.negotiation || data.negotiation.roomId !== roomId) return;
        console.log(`[DrawingEditor] Received payment:request-sent | Room: ${roomId}`);
        setNegotiation(data.negotiation);
      };

      const handleCounteroffer = (data) => {
        if (!data?.negotiation || data.negotiation.roomId !== roomId) return;
        console.log(`[DrawingEditor] Received payment:counteroffer | Room: ${roomId}`);
        setNegotiation(data.negotiation);
      };

      const handleRaise = (data) => {
        if (!data?.negotiation || data.negotiation.roomId !== roomId) return;
        console.log(`[DrawingEditor] Received payment:raise | Room: ${roomId}`);
        setNegotiation(data.negotiation);
      };

      const handleAccepted = (data) => {
        if (!data?.negotiation || data.negotiation.roomId !== roomId) return;
        console.log(`[DrawingEditor] Received payment:offer-accepted | Room: ${roomId} | Status: AGREED`);
        setNegotiation(data.negotiation);
      };

      const handleHold = (data) => {
        if (!data?.negotiation || data.negotiation.roomId !== roomId) return;
        console.log(`[DrawingEditor] Received payment:hold | Room: ${roomId}`);
        setNegotiation(data.negotiation);
      };

      const handleResume = (data) => {
        if (!data?.negotiation || data.negotiation.roomId !== roomId) return;
        console.log(`[DrawingEditor] Received payment:resume | Room: ${roomId}`);
        setNegotiation(data.negotiation);
      };

      const handleCancel = (data) => {
        if (!data?.negotiation || data.negotiation.roomId !== roomId) return;
        console.log(`[DrawingEditor] Received payment:cancel | Room: ${roomId}`);
        setNegotiation(data.negotiation);
      };

      const handleInvoiceCreated = (data) => {
        if (!data?.negotiation || data.negotiation.roomId !== roomId) return;
        console.log(`[DrawingEditor] Received payment:invoice-created | Room: ${roomId}`);
        setNegotiation(data.negotiation);
      };

      const handleInvoiceSent = (data) => {
        if (!data?.negotiation || data.negotiation.roomId !== roomId) return;
        console.log(`[DrawingEditor] Received payment:invoice-sent | Room: ${roomId}`);
        setNegotiation(data.negotiation);
      };

      const handlePaid = (data) => {
        console.log(`[DrawingEditor] Received payment:paid | Status: ${data.status}`);
        setPaidStampData({
          status: data.status,
          amountPaid: data.amountPaid,
          currency: data.currency,
          invoiceNumber: data.invoiceNumber,
          paymentTime: data.paymentTime,
        });
        setNegotiation((prev) => (prev ? { ...prev, status: data.status } : null));
      };

      const handleStatusUpdated = (data) => {
        if (!data?.negotiation || data.negotiation.roomId !== roomId) return;
        console.log(`[DrawingEditor] Received payment:status-updated | Room: ${roomId}`);
        setNegotiation(data.negotiation);
      };

      const handleSocketConnect = () => {
        console.log(`[DrawingEditor] Socket reconnected (${socket.id}). Syncing negotiation state for room: ${roomId}`);
        socket.emit("payment:sync", { roomId }, (ack) => {
          if (ack?.ok && ack.negotiation) {
            setNegotiation(ack.negotiation);
          }
        });
        fetchNegotiationState(roomId)
          .then((neg) => {
            if (neg) setNegotiation(neg);
          })
          .catch(console.error);
      };

      socket.on("payment:offer", handleOffer);
      socket.on("payment:request-sent", handleRequestSent);
      socket.on("payment:counteroffer", handleCounteroffer);
      socket.on("payment:counteroffer-sent", handleCounteroffer);
      socket.on("payment:raise", handleRaise);
      socket.on("payment:raise-sent", handleRaise);
      socket.on("payment:offer-accepted", handleAccepted);
      socket.on("payment:hold", handleHold);
      socket.on("payment:resume", handleResume);
      socket.on("payment:cancel", handleCancel);
      socket.on("payment:invoice-created", handleInvoiceCreated);
      socket.on("payment:invoice-sent", handleInvoiceSent);
      socket.on("payment:paid", handlePaid);
      socket.on("payment:status-updated", handleStatusUpdated);
      socket.on("connect", handleSocketConnect);

      cleanupSocket = () => {
        console.log(`[DrawingEditor] Cleaning up Socket.IO listeners for room: ${roomId}`);
        socket.off("payment:offer", handleOffer);
        socket.off("payment:request-sent", handleRequestSent);
        socket.off("payment:counteroffer", handleCounteroffer);
        socket.off("payment:counteroffer-sent", handleCounteroffer);
        socket.off("payment:raise", handleRaise);
        socket.off("payment:raise-sent", handleRaise);
        socket.off("payment:offer-accepted", handleAccepted);
        socket.off("payment:hold", handleHold);
        socket.off("payment:resume", handleResume);
        socket.off("payment:cancel", handleCancel);
        socket.off("payment:invoice-created", handleInvoiceCreated);
        socket.off("payment:invoice-sent", handleInvoiceSent);
        socket.off("payment:paid", handlePaid);
        socket.off("payment:status-updated", handleStatusUpdated);
        socket.off("connect", handleSocketConnect);
      };
    });

    return () => {
      unsubRole();
      unsubSocket();
      cleanupSocket();
    };
  }, [collabController]);

  const handleSubmitPaymentRequest = ({ items, currency, message, selectedElementIds }) => {
    const socket = liveSocket || collabController?.rawSocket;
    const roomId = liveRoomId || collabController?.roomId;

    if (!socket || !roomId) {
      alert("Please start or join a collaboration room first to request payment from collaborators.");
      return;
    }

    console.log(`[DrawingEditor] Emitting payment:request for room: ${roomId}`);
    socket.emit(
      "payment:request",
      {
        roomId,
        senderName: "Host",
        selectedElementIds,
        currency,
        items,
        message,
      },
      (ack) => {
        if (ack?.ok && ack.negotiation) {
          console.log("[DrawingEditor] payment:request acknowledged by backend");
          setNegotiation(ack.negotiation);
        } else if (ack && !ack.ok) {
          console.error("[DrawingEditor] payment:request error:", ack.error);
          alert(ack.error || "Failed to create payment request");
        }
      }
    );
  };

  useEffect(() => {
    const flush = () => {
      window.clearTimeout(timerRef.current);
      const latest = latestRef.current;
      if (!latest) return;

      const serialized = serializeAsJSON(
        latest.elements,
        latest.appState,
        latest.files,
        "local",
      );
      storage.write(fileName, serialized);
      latestRef.current = null;
    };

    flushRef.current = flush;
    editor.flush = flush;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flush();
      if (editor.flush === flush) editor.flush = () => {};
    };
  }, [fileName]);

  const handleChange = (elements, appState, files) => {
    if (appState?.theme) onThemeChange(appState.theme);
    const nextSelectionSignature = getSelectionSignature(elements, appState);
    if (selectionSignatureRef.current !== nextSelectionSignature) {
      selectionSignatureRef.current = nextSelectionSignature;
      setSelection({ elements, appState });
    }
    latestRef.current = { elements, appState, files };
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => flushRef.current(), 800);
  };

  const currentSocketId = liveSocket?.id || collabController?.rawSocket?.id;
  const isHost = Boolean(
    participantRole === "host" ||
    (negotiation?.hostSocketId && currentSocketId && negotiation.hostSocketId === currentSocketId)
  );

  return (
    <Excalidraw
      initialData={initialData}
      onChange={handleChange}
      excalidrawAPI={setApi}
    >
      <MainMenu>
        <MainMenu.Item
          icon={<FolderOpen size={16} strokeWidth={1.8} />}
          onClick={onOpenExplorer}
        >
          Drawing Explorer
        </MainMenu.Item>
        <MainMenu.Separator />
        <MainMenu.DefaultItems.LoadScene />
        <MainMenu.DefaultItems.SaveToActiveFile />
        <MainMenu.DefaultItems.Export />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.DefaultItems.Help />
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.Separator />
        <MainMenu.Group title="Excalidraw links">
          <MainMenu.DefaultItems.Socials />
        </MainMenu.Group>
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ToggleTheme />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      </MainMenu>
      <BillingDetails
        api={api}
        elements={selection.elements}
        appState={selection.appState}
        onGenerateInvoice={handleGenerateInvoice}
        onRequestPayment={handleOpenPaymentRequest}
        isHost={isHost}
      />
      {explorer(api, setCollabController)}
      <InvoiceModal
        isOpen={invoiceModalOpen}
        onClose={() => setInvoiceModalOpen(false)}
        activeFileName={fileName}
        billingItems={invoiceBillingItems}
      />
      <PaymentRequestModal
        isOpen={paymentRequestModalOpen}
        onClose={() => setPaymentRequestModalOpen(false)}
        initialItems={requestPaymentItems}
        selectedElements={requestPaymentElements}
        currency={requestPaymentItems[0]?.currency || "USD"}
        onSubmit={handleSubmitPaymentRequest}
      />
      <NegotiationOverlay
        negotiation={negotiation}
        role={isHost ? "host" : "collaborator"}
        socket={liveSocket || collabController?.rawSocket}
        roomId={liveRoomId || collabController?.roomId}
        onHighlightElements={handleHighlightElements}
      />
      <CanvasPaidStamp paidData={paidStampData} />
    </Excalidraw>
  );
}
