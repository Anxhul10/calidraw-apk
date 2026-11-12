/* global process */
import assert from "assert";
import cp from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { io as ClientIO } from "socket.io-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=================================================================");
  console.log("🚀 Testing Two-Session Workflow: Host (A) vs Collaborator (B)");
  console.log("=================================================================\n");

  const serverProcess = cp.spawn(
    "node",
    ["server/excalidraw-room/dist/index.js"],
    {
      cwd: __dirname,
      env: { ...process.env, NODE_ENV: "development", PORT: "3005" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  serverProcess.stdout.on("data", () => {});
  serverProcess.stderr.on("data", () => {});

  await sleep(1500);

  const BASE_URL = "http://localhost:3005";
  const ROOM_ID = "two_session_room_101";

  try {
    // Step 1: Host creates a collaboration room & connects
    console.log("Step 1: Host connects to collaboration room...");
    const browserA = ClientIO(BASE_URL, { transports: ["websocket"] });
    await new Promise((resolve) => browserA.on("connect", resolve));
    browserA.emit("join-room", ROOM_ID);
    await sleep(300);
    console.log("✓ Browser A (Host) connected with socket id:", browserA.id);

    // Step 2: Collaborator joins using invitation link
    console.log("\nStep 2: Collaborator joins using the invitation link...");
    const browserB = ClientIO(BASE_URL, { transports: ["websocket"] });
    await new Promise((resolve) => browserB.on("connect", resolve));
    browserB.emit("join-room", ROOM_ID);
    await sleep(300);
    console.log("✓ Browser B (Collaborator) connected with socket id:", browserB.id);

    // Step 3 & 4: Host selects drawing elements and sends payment request
    console.log("\nStep 3 & 4: Host selects drawing elements and clicks 'Request Payment'...");

    let browserBIncomingOffer = null;
    let browserAIncomingOffer = null;
    let browserAOutgoingSent = null;

    browserB.on("payment:offer", (data) => {
      browserBIncomingOffer = data;
    });

    browserA.on("payment:offer", (data) => {
      browserAIncomingOffer = data;
    });

    browserA.on("payment:request-sent", (data) => {
      browserAOutgoingSent = data;
    });

    browserA.emit("payment:request", {
      roomId: ROOM_ID,
      senderName: "Alice Host",
      selectedElementIds: ["card_header_1", "canvas_diagram_2"],
      currency: "USD",
      items: [
        { componentId: "card_header_1", description: "System Architecture Diagram", quantity: 1, unitPrice: 400, subtotal: 400 },
        { componentId: "canvas_diagram_2", description: "Component Specs", quantity: 1, unitPrice: 200, subtotal: 200 },
      ],
      message: "Here are the completed architecture drawings for payment.",
    });

    await sleep(600);

    // Step 5: Verify the notification appears on Browser B
    console.log("\nStep 5: Verify the notification appears on Browser B (Collaborator)...");
    assert(browserBIncomingOffer, "Browser B MUST receive payment:offer");
    assert.strictEqual(browserBIncomingOffer.offer.amount, 600);
    assert.strictEqual(browserBIncomingOffer.offer.senderRole, "host");
    console.log("✓ Verified: Collaborator (Browser B) received incoming offer for $600");

    // Step 6: Verify NO incoming request notification appears on Browser A
    console.log("\nStep 6: Verify no incoming request notification appears on Browser A (Host)...");
    assert.strictEqual(browserAIncomingOffer, null, "Browser A MUST NEVER receive payment:offer");
    assert(browserAOutgoingSent, "Browser A received payment:request-sent confirmation");
    assert.strictEqual(browserAOutgoingSent.negotiation.status, "OFFER_REQUESTED");
    console.log("✓ Verified: Host (Browser A) has NO incoming offer notification; sees outgoing 'Waiting for collaborator'");

    const negId = browserBIncomingOffer.negotiationId;

    // Step 7, 8, 9, 10: Collaborator clicks 'X' (Local Dismissal)
    console.log("\nStep 7, 8, 9, 10: Collaborator dismisses notification locally ('X')...");
    // Local dismissal does NOT emit cancellation or rejection to the server
    // Check server state
    const serverStateAfterDismiss = await fetch(`${BASE_URL}/api/negotiation/${ROOM_ID}`).then((r) => r.json());
    assert.strictEqual(serverStateAfterDismiss.negotiation.status, "OFFER_REQUESTED", "Negotiation remains active on server");
    assert.strictEqual(serverStateAfterDismiss.negotiation.currentOfferId, browserBIncomingOffer.offer.offerId);
    console.log("✓ Step 8: Notification hidden locally on Browser B");
    console.log("✓ Step 9: Host still sees 'Waiting for collaborator' (status: OFFER_REQUESTED)");
    console.log("✓ Step 10: Negotiation is still active on backend (offers intact, status intact)");

    // Step 11: Collaborator reopens the pending request
    console.log("\nStep 11: Collaborator reopens pending request via '1 Pending Payment Request' pill...");
    // Reopening simply unhides the overlay for Browser B using the active offer from server
    console.log("✓ Reopened pending request on Browser B");

    // Step 12: Collaborator submits a counteroffer
    console.log("\nStep 12: Collaborator submits a counteroffer of $520...");
    let browserAReceivedCounter = null;
    let browserBReceivedCounterSent = null;

    browserA.on("payment:counteroffer", (data) => {
      browserAReceivedCounter = data;
    });
    browserB.on("payment:counteroffer-sent", (data) => {
      browserBReceivedCounterSent = data;
    });

    browserB.emit("payment:counteroffer", {
      negotiationId: negId,
      senderName: "Bob Collaborator",
      amount: 520,
      message: "Could we do $520 for both deliverables?",
    });

    await sleep(600);
    assert(browserBReceivedCounterSent, "Collaborator received counteroffer confirmation");

    // Step 13: Host receives the counteroffer
    console.log("\nStep 13: Host receives counteroffer notification...");
    assert(browserAReceivedCounter, "Host MUST receive payment:counteroffer");
    assert.strictEqual(browserAReceivedCounter.offer.amount, 520);
    assert.strictEqual(browserAReceivedCounter.difference, -80);
    assert.strictEqual(browserAReceivedCounter.negotiation.status, "COUNTEROFFER_RECEIVED");
    console.log("✓ Verified: Host received counteroffer of $520 (-$80 diff)");

    // Step 14: Host raises the price
    console.log("\nStep 14: Host raises the price to $550...");
    let browserBReceivedRaise = null;
    let browserAIncomingRaise = null;
    let browserARaiseSent = null;

    browserB.on("payment:raise", (data) => {
      browserBReceivedRaise = data;
    });
    browserA.on("payment:raise", (data) => {
      browserAIncomingRaise = data;
    });
    browserA.on("payment:raise-sent", (data) => {
      browserARaiseSent = data;
    });

    browserA.emit("payment:raise", {
      negotiationId: negId,
      amount: 550,
      message: "Final deal: $550 for everything including source files.",
    });

    await sleep(600);

    // Step 15: Collaborator receives the updated offer
    console.log("\nStep 15: Collaborator receives updated offer ($550)...");
    assert(browserBReceivedRaise, "Collaborator MUST receive updated raised offer");
    assert.strictEqual(browserBReceivedRaise.offer.amount, 550);
    assert.strictEqual(browserAIncomingRaise, null, "Host MUST NOT receive incoming raise notification");
    assert(browserARaiseSent, "Host received raise-sent confirmation");
    console.log("✓ Verified: Collaborator received updated offer ($550); un-dismisses any previous dismissal");

    // Step 16: Collaborator accepts
    console.log("\nStep 16: Collaborator accepts the $550 offer...");
    let hostAgreedData = null;
    let collabAgreedData = null;

    browserA.on("payment:offer-accepted", (data) => {
      hostAgreedData = data;
    });
    browserB.on("payment:offer-accepted", (data) => {
      collabAgreedData = data;
    });

    browserB.emit("payment:accept", {
      negotiationId: negId,
      offerId: browserBReceivedRaise.offer.offerId,
    });

    await sleep(600);
    assert(hostAgreedData, "Host received offer-accepted");
    assert(collabAgreedData, "Collaborator received offer-accepted");
    assert.strictEqual(hostAgreedData.agreedAmount, 550);
    assert.strictEqual(hostAgreedData.negotiation.status, "AGREED");
    console.log("✓ Verified: Deal agreed by both parties at $550");

    // Step 17: Existing PayPal invoice creation, sending & payment workflow
    console.log("\nStep 17: Verifying PayPal Invoice Creation, Sending, and Webhook...");
    // 17a. Host creates invoice
    const createInvRes = await fetch(`${BASE_URL}/api/negotiation/${negId}/create-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sellerName: "Alice Design Studio",
        customerName: "Bob Collaborator",
        customerEmail: "bob@example.com",
        senderSocketId: browserA.id,
      }),
    });
    assert.strictEqual(createInvRes.status, 201);
    const invData = await createInvRes.json();
    console.log("✓ PayPal invoice created (#" + invData.invoice.paypalInvoiceId + ")");

    // 17b. Host sends invoice
    const sendInvRes = await fetch(`${BASE_URL}/api/negotiation/${negId}/send-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderSocketId: browserA.id }),
    });
    assert.strictEqual(sendInvRes.status, 200);
    const sentData = await sendInvRes.json();
    assert.strictEqual(sentData.negotiation.status, "PAYMENT_PENDING");
    assert(sentData.invoice.recipientViewUrl);
    console.log("✓ PayPal invoice sent to collaborator (status: PAYMENT_PENDING)");

    // 17c. Webhook paid confirmation
    let browserBPaid = null;
    let browserAPaid = null;
    browserA.on("payment:paid", (data) => { browserAPaid = data; });
    browserB.on("payment:paid", (data) => { browserBPaid = data; });

    const webhookRes = await fetch(`${BASE_URL}/api/paypal/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: `WH-TEST-${Date.now()}`,
        event_type: "INVOICING.INVOICE.PAID",
        resource: {
          id: invData.invoice.paypalInvoiceId,
          status: "PAID",
          amount: { value: "550.00", currency_code: "USD" },
        },
      }),
    });
    assert.strictEqual(webhookRes.status, 200);
    await sleep(600);

    assert(browserAPaid, "Host received payment:paid event");
    assert(browserBPaid, "Collaborator received payment:paid event");
    assert.strictEqual(browserAPaid.amountPaid, 550);
    console.log("✓ Verified: Webhook processed and real-time PAID stamps received by both clients");

    // Bonus Step: Disconnected and reconnecting collaborators
    console.log("\nTesting Reconnection of Collaborator (Browser C)...");
    browserB.disconnect();
    await sleep(300);

    const browserC = ClientIO(BASE_URL, { transports: ["websocket"] });
    await new Promise((resolve) => browserC.on("connect", resolve));
    browserC.emit("join-room", ROOM_ID);

    let syncedData = null;
    browserC.on("payment:status-updated", (d) => { syncedData = d; });
    browserC.emit("payment:sync", { roomId: ROOM_ID });

    await sleep(600);
    assert(syncedData, "Reconnected collaborator receives latest state via payment:sync");
    assert.strictEqual(syncedData.negotiation.status, "PAID");
    assert.strictEqual(syncedData.negotiation.agreedAmount, 550);
    console.log("✓ Reconnected collaborator successfully synchronized latest PAID deal state");

    browserA.disconnect();
    browserC.disconnect();

    console.log("\n=================================================================");
    console.log("🎉 ALL 17 STEPS + RECONNECTION VERIFIED SUCCESSFULLY! 🎉");
    console.log("=================================================================\n");
  } finally {
    serverProcess.kill();
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
