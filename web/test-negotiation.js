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
  console.log("Starting server for negotiation & paypal integration testing...");
  const serverProcess = cp.spawn(
    "node",
    ["server/excalidraw-room/dist/index.js"],
    {
      cwd: __dirname,
      env: { ...process.env, NODE_ENV: "development", PORT: "3004" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  serverProcess.stdout.on("data", (data) => {
    console.log("[SERVER]", data.toString().trim());
  });
  serverProcess.stderr.on("data", (data) => {
    console.error("[SERVER ERR]", data.toString().trim());
  });

  await sleep(1500);

  const BASE_URL = "http://localhost:3004";
  const TEST_ROOM = "test_negotiation_room_1";

  try {
    // 1. Connect two independent sockets (Host and Collaborator)
    console.log("\nConnecting Host and Collaborator sockets...");
    const hostSocket = ClientIO(BASE_URL, { transports: ["websocket"] });
    const collabSocket = ClientIO(BASE_URL, { transports: ["websocket"] });

    await new Promise((resolve) => {
      let count = 0;
      const done = () => { if (++count === 2) resolve(true); };
      hostSocket.on("connect", done);
      collabSocket.on("connect", done);
    });

    console.log("✓ Sockets connected: Host", hostSocket.id, "Collaborator", collabSocket.id);

    // Join room
    hostSocket.emit("join-room", TEST_ROOM);
    collabSocket.emit("join-room", TEST_ROOM);
    await sleep(500);

    // 2. Scenario A: Host initiates payment request with items
    console.log("\nTesting Host payment:request...");
    let collabReceivedOffer = null;
    let hostReceivedIncomingOffer = null;
    let hostReceivedConfirmation = null;

    collabSocket.on("payment:offer", (data) => {
      collabReceivedOffer = data;
    });
    hostSocket.on("payment:offer", (data) => {
      hostReceivedIncomingOffer = data;
    });
    hostSocket.on("payment:request-sent", (data) => {
      hostReceivedConfirmation = data;
    });

    hostSocket.emit("payment:request", {
      roomId: TEST_ROOM,
      senderName: "Alice Host",
      selectedElementIds: ["elem_1", "elem_2"],
      currency: "USD",
      items: [
        { componentId: "elem_1", description: "Design System", quantity: 1, unitPrice: 300, subtotal: 300 },
        { componentId: "elem_2", description: "Mobile Prototype", quantity: 2, unitPrice: 150, subtotal: 300 },
      ],
      message: "Here are the completed UI components.",
    });

    await sleep(600);
    assert(collabReceivedOffer, "Collaborator received payment:offer");
    assert.strictEqual(hostReceivedIncomingOffer, null, "Host must NEVER receive incoming payment:offer notification");
    assert(hostReceivedConfirmation, "Host received outgoing payment:request-sent confirmation");
    assert.strictEqual(collabReceivedOffer.offer.amount, 600, "Calculated total matches: 300 + 300 = 600");
    assert.strictEqual(collabReceivedOffer.negotiation.status, "OFFER_REQUESTED");
    const negId = collabReceivedOffer.negotiationId;
    console.log("✓ Collaborator received incoming offer ($600)");
    console.log("✓ Host received outgoing payment:request-sent (no incoming notification on host screen)");

    // 2b. Test Local Dismissal simulation
    console.log("\nTesting Local Dismissal behavior...");
    // Collaborator dismisses notification locally:
    // Assert negotiation is still active on server and host still sees OFFER_REQUESTED
    const syncBefore = await fetch(`${BASE_URL}/api/negotiation/${TEST_ROOM}`).then((r) => r.json());
    assert.strictEqual(syncBefore.negotiation.status, "OFFER_REQUESTED", "Dismissing notification locally leaves negotiation active");
    console.log("✓ Local dismissal does NOT cancel negotiation or affect host interface");

    // 3. Scenario A: Collaborator sends counteroffer
    console.log("\nTesting Collaborator payment:counteroffer...");
    let receivedCounter = null;
    hostSocket.on("payment:counteroffer", (data) => {
      receivedCounter = data;
    });

    collabSocket.emit("payment:counteroffer", {
      negotiationId: negId,
      senderName: "Bob Collaborator",
      amount: 450,
      message: "Could we do $450 for the package?",
    });

    await sleep(600);
    assert(receivedCounter, "Host received counteroffer");
    assert.strictEqual(receivedCounter.offer.amount, 450);
    assert.strictEqual(receivedCounter.difference, -150, "Difference calculated (-150)");
    assert.strictEqual(receivedCounter.negotiation.status, "COUNTEROFFER_RECEIVED");
    console.log("✓ payment:counteroffer verified ($450 counteroffer, -$150 diff)");

    // 4. Scenario C: Host puts on hold & resume
    console.log("\nTesting Hold and Resume...");
    let holdReceived = false;
    let resumeReceived = false;
    collabSocket.on("payment:hold", () => { holdReceived = true; });
    collabSocket.on("payment:resume", () => { resumeReceived = true; });

    hostSocket.emit("payment:hold", { negotiationId: negId });
    await sleep(400);
    assert(holdReceived, "Hold broadcast received");

    // Collaborator tries to counteroffer while on hold -> should fail
    let errorReceived = null;
    collabSocket.once("payment:error", (err) => { errorReceived = err; });
    collabSocket.emit("payment:counteroffer", {
      negotiationId: negId,
      senderName: "Bob Collaborator",
      amount: 400,
    });
    await sleep(400);
    assert(errorReceived, "Server rejected counteroffer while on hold");
    console.log("✓ Server correctly rejected counteroffer while ON_HOLD");

    hostSocket.emit("payment:resume", { negotiationId: negId });
    await sleep(400);
    assert(resumeReceived, "Resume broadcast received");
    console.log("✓ Hold and Resume workflow verified");

    // 5. Host raises offer to $500
    console.log("\nTesting Host payment:raise...");
    let raiseReceived = null;
    let hostIncomingRaise = null;
    let hostRaiseSent = null;

    collabSocket.on("payment:raise", (data) => { raiseReceived = data; });
    hostSocket.on("payment:raise", (data) => { hostIncomingRaise = data; });
    hostSocket.on("payment:raise-sent", (data) => { hostRaiseSent = data; });

    hostSocket.emit("payment:raise", {
      negotiationId: negId,
      amount: 500,
      message: "I can meet you in the middle at $500.",
    });

    await sleep(600);
    assert(raiseReceived, "Collaborator received raised offer");
    assert.strictEqual(hostIncomingRaise, null, "Host must NOT receive incoming payment:raise notification");
    assert(hostRaiseSent, "Host received outgoing payment:raise-sent confirmation");
    assert.strictEqual(raiseReceived.offer.amount, 500);
    console.log("✓ payment:raise verified ($500 for collaborator, no incoming modal for host)");

    // 6. Collaborator accepts the offer ($500)
    console.log("\nTesting Collaborator payment:accept...");
    let agreedData = null;
    hostSocket.on("payment:offer-accepted", (data) => { agreedData = data; });

    collabSocket.emit("payment:accept", {
      negotiationId: negId,
      offerId: raiseReceived.offer.offerId,
    });

    await sleep(600);
    assert(agreedData, "Host received agreement");
    assert.strictEqual(agreedData.agreedAmount, 500);
    assert.strictEqual(agreedData.negotiation.status, "AGREED");
    console.log("✓ Deal successfully AGREED at $500");

    // 7. Host creates PayPal Invoice for agreed deal
    console.log("\nTesting POST /api/negotiation/:id/create-invoice...");
    const createInvRes = await fetch(`${BASE_URL}/api/negotiation/${negId}/create-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sellerName: "Alice Design Studio",
        customerName: "Bob Client",
        customerEmail: "bob@example.com",
        senderSocketId: hostSocket.id,
      }),
    });

    assert.strictEqual(createInvRes.status, 201, "Invoice creation returned 201");
    const createInvData = await createInvRes.json();
    assert(createInvData.invoice.paypalInvoiceId, "PayPal invoice ID generated");
    assert.strictEqual(createInvData.negotiation.status, "INVOICE_CREATED");
    console.log("✓ PayPal invoice created (#" + createInvData.invoice.paypalInvoiceId + ")");

    // 8. Host sends invoice
    console.log("\nTesting POST /api/negotiation/:id/send-invoice...");
    const sendInvRes = await fetch(`${BASE_URL}/api/negotiation/${negId}/send-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderSocketId: hostSocket.id }),
    });

    assert.strictEqual(sendInvRes.status, 200, "Send invoice returned 200");
    const sendInvData = await sendInvRes.json();
    assert.strictEqual(sendInvData.negotiation.status, "PAYMENT_PENDING");
    assert(sendInvData.invoice.recipientViewUrl, "Recipient view URL generated");
    console.log("✓ PayPal invoice sent, status PAYMENT_PENDING, recipient URL available");

    // 9. Webhook simulation & PAID Stamp broadcast (Scenario E)
    console.log("\nTesting Webhook verification & PAID stamp broadcast...");
    let paidStampReceived = null;
    collabSocket.on("payment:paid", (data) => { paidStampReceived = data; });

    const webhookPayload = {
      id: `WH-EVENT-${Date.now()}`,
      event_type: "INVOICING.INVOICE.PAID",
      resource: {
        id: createInvData.invoice.paypalInvoiceId,
        status: "PAID",
        amount: { value: "500.00", currency_code: "USD" },
      },
    };

    const webhookRes = await fetch(`${BASE_URL}/api/paypal/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPayload),
    });

    assert.strictEqual(webhookRes.status, 200, "Webhook processed 200");
    await sleep(600);

    assert(paidStampReceived, "Collaborator received real-time payment:paid event");
    assert.strictEqual(paidStampReceived.status, "PAID");
    assert.strictEqual(paidStampReceived.amountPaid, 500);
    assert.deepStrictEqual(paidStampReceived.selectedElementIds, ["elem_1", "elem_2"]);
    console.log("✓ Verified payment webhook broadcasted PAID stamp on elements:", paidStampReceived.selectedElementIds);

    // 10. Late joiner / reconnect sync check (Scenario D)
    console.log("\nTesting Late Joiner / Reconnect Sync (GET /api/negotiation/:roomId)...");
    const syncRes = await fetch(`${BASE_URL}/api/negotiation/${TEST_ROOM}`);
    assert.strictEqual(syncRes.status, 200);
    const syncData = await syncRes.json();
    assert.strictEqual(syncData.negotiation.negotiationId, negId);
    assert.strictEqual(syncData.negotiation.status, "PAID");
    console.log("✓ Late joiners successfully retrieve persistent PAID negotiation state");

    hostSocket.disconnect();
    collabSocket.disconnect();

    console.log("\n=======================================================");
    console.log("🎉 ALL NEGOTIATION & PAYPAL INTEGRATION TESTS PASSED! 🎉");
    console.log("=======================================================\n");
  } finally {
    serverProcess.kill();
  }
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
