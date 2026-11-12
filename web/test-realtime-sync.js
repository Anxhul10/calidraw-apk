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
  console.log("=======================================================================");
  console.log("⚡ TESTING REAL-TIME NEGOTIATION SYNCHRONIZATION (ZERO-LATENCY / NO TAB SWITCH)");
  console.log("=======================================================================\n");

  const serverProcess = cp.spawn(
    "node",
    ["server/excalidraw-room/dist/index.js"],
    {
      cwd: __dirname,
      env: { ...process.env, NODE_ENV: "development", PORT: "3006" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  serverProcess.stdout.on("data", () => {});
  serverProcess.stderr.on("data", () => {});

  await sleep(1500);

  const BASE_URL = "http://localhost:3006";
  const ROOM_ID = "realtime_sync_room_999";

  try {
    // Connect Host (Session A) and Collaborator (Session B)
    console.log("Connecting Host (A) and Collaborator (B)...");
    const hostSocket = ClientIO(BASE_URL, { transports: ["websocket"] });
    const collabSocket = ClientIO(BASE_URL, { transports: ["websocket"] });

    await new Promise((resolve) => {
      let count = 0;
      const done = () => { if (++count === 2) resolve(true); };
      hostSocket.on("connect", done);
      collabSocket.on("connect", done);
    });

    hostSocket.emit("join-room", ROOM_ID);
    collabSocket.emit("join-room", ROOM_ID);
    await sleep(300);

    // ---------------------------------------------------------
    // TEST A: Immediate incoming request without tab switch / refresh
    // ---------------------------------------------------------
    console.log("\n[TEST A] Immediate Incoming Request (No Tab Switch / No Refresh)...");
    let collabOfferReceived = null;
    let collabReceiveTime = null;
    const sendTime = Date.now();

    collabSocket.on("payment:offer", (data) => {
      collabOfferReceived = data;
      collabReceiveTime = Date.now();
    });

    let hostAckReceived = null;
    hostSocket.emit(
      "payment:request",
      {
        roomId: ROOM_ID,
        senderName: "Host Alice",
        selectedElementIds: ["wireframe_box_1"],
        currency: "USD",
        items: [
          { componentId: "wireframe_box_1", description: "Design Sprint Deliverables", quantity: 1, unitPrice: 750, subtotal: 750 },
        ],
        message: "Payment requested for design deliverables.",
      },
      (ack) => {
        hostAckReceived = ack;
      }
    );

    // Wait minimal time (<= 300ms) for real-time socket delivery
    await sleep(250);

    assert(hostAckReceived && hostAckReceived.ok, "Host received synchronous acknowledgement callback");
    assert(collabOfferReceived, "Collaborator received payment:offer immediately without tab switch");
    assert.strictEqual(collabOfferReceived.offer.amount, 750);
    const latencyA = collabReceiveTime - sendTime;
    console.log(`✓ [TEST A PASSED] Collaborator received payment:offer in ${latencyA}ms (INSTANT, NO TAB SWITCH REQUIRED)`);

    const negId = collabOfferReceived.negotiationId;

    // ---------------------------------------------------------
    // TEST B: Immediate Acceptance (Host immediately sees AGREED without refresh)
    // ---------------------------------------------------------
    console.log("\n[TEST B] Immediate Acceptance (Host immediately sees AGREED without refreshing)...");
    let hostAgreedReceived = null;
    let hostAgreedTime = null;
    const acceptSendTime = Date.now();

    hostSocket.on("payment:offer-accepted", (data) => {
      hostAgreedReceived = data;
      hostAgreedTime = Date.now();
    });

    let collabAcceptAck = null;
    collabSocket.emit(
      "payment:accept",
      {
        negotiationId: negId,
        offerId: collabOfferReceived.offer.offerId,
      },
      (ack) => {
        collabAcceptAck = ack;
      }
    );

    await sleep(250);

    assert(collabAcceptAck && collabAcceptAck.ok, "Collaborator received acceptance ack callback");
    assert(hostAgreedReceived, "Host immediately received payment:offer-accepted event without refreshing");
    assert.strictEqual(hostAgreedReceived.negotiation.status, "AGREED");
    assert.strictEqual(hostAgreedReceived.agreedAmount, 750);
    const latencyB = hostAgreedTime - acceptSendTime;
    console.log(`✓ [TEST B PASSED] Host immediately updated to AGREED status in ${latencyB}ms (NO REFRESH REQUIRED)`);

    // ---------------------------------------------------------
    // TEST C: Counteroffer & Raise Real-Time Delivery
    // ---------------------------------------------------------
    console.log("\n[TEST C] Counteroffer & Raise Real-Time Delivery...");
    // Create new negotiation for counter/raise test
    const ROOM_ID_2 = "realtime_sync_room_888";
    hostSocket.emit("join-room", ROOM_ID_2);
    collabSocket.emit("join-room", ROOM_ID_2);
    await sleep(200);

    let neg2Id = null;
    await new Promise((resolve) => {
      hostSocket.emit(
        "payment:request",
        {
          roomId: ROOM_ID_2,
          senderName: "Host Alice",
          selectedElementIds: ["element_hero"],
          currency: "USD",
          items: [{ componentId: "element_hero", description: "Hero Graphic", quantity: 1, unitPrice: 1000, subtotal: 1000 }],
        },
        (ack) => {
          neg2Id = ack.negotiationId;
          resolve(true);
        }
      );
    });

    let hostCounterReceived = null;
    hostSocket.on("payment:counteroffer", (data) => { hostCounterReceived = data; });

    let collabCounterAck = null;
    collabSocket.emit(
      "payment:counteroffer",
      {
        negotiationId: neg2Id,
        senderName: "Collaborator Bob",
        amount: 800,
        message: "Can we do $800?",
      },
      (ack) => { collabCounterAck = ack; }
    );
    await sleep(200);

    assert(collabCounterAck && collabCounterAck.ok, "Collaborator counteroffer acknowledged");
    assert(hostCounterReceived, "Host immediately received counteroffer");
    assert.strictEqual(hostCounterReceived.offer.amount, 800);
    assert.strictEqual(hostCounterReceived.difference, -200);
    console.log("✓ [TEST C1 PASSED] Collaborator counteroffer received by Host immediately ($800, diff -$200)");

    let collabRaiseReceived = null;
    collabSocket.on("payment:raise", (data) => { collabRaiseReceived = data; });

    let hostRaiseAck = null;
    hostSocket.emit(
      "payment:raise",
      {
        negotiationId: neg2Id,
        amount: 900,
        message: "Split the difference at $900.",
      },
      (ack) => { hostRaiseAck = ack; }
    );
    await sleep(200);

    assert(hostRaiseAck && hostRaiseAck.ok, "Host raise acknowledged");
    assert(collabRaiseReceived, "Collaborator immediately received raised offer");
    assert.strictEqual(collabRaiseReceived.offer.amount, 900);
    console.log("✓ [TEST C2 PASSED] Host raised offer received by Collaborator immediately ($900)");

    // ---------------------------------------------------------
    // TEST D: Hold and Resume Real-Time Delivery
    // ---------------------------------------------------------
    console.log("\n[TEST D] Hold and Resume Real-Time Delivery...");
    let collabHoldReceived = null;
    collabSocket.on("payment:hold", (data) => { collabHoldReceived = data; });

    hostSocket.emit("payment:hold", { negotiationId: neg2Id });
    await sleep(200);
    assert(collabHoldReceived, "Collaborator immediately received ON_HOLD state");
    assert.strictEqual(collabHoldReceived.negotiation.status, "ON_HOLD");
    console.log("✓ [TEST D1 PASSED] Hold immediately received by Collaborator");

    let collabResumeReceived = null;
    collabSocket.on("payment:resume", (data) => { collabResumeReceived = data; });

    hostSocket.emit("payment:resume", { negotiationId: neg2Id });
    await sleep(200);
    assert(collabResumeReceived, "Collaborator immediately received resumed state");
    console.log("✓ [TEST D2 PASSED] Resume immediately received by Collaborator");

    // ---------------------------------------------------------
    // TEST E: Reconnection without Duplicate Offers
    // ---------------------------------------------------------
    console.log("\n[TEST E] Reconnection without Duplicate Offers...");
    collabSocket.disconnect();
    await sleep(300);

    // Host accepts agreement while collaborator is offline
    await new Promise((resolve) => {
      hostSocket.emit(
        "payment:raise",
        { negotiationId: neg2Id, amount: 950 },
        () => resolve(true)
      );
    });

    // Reconnecting collaborator socket
    const reconnectedSocket = ClientIO(BASE_URL, { transports: ["websocket"] });
    await new Promise((resolve) => reconnectedSocket.on("connect", resolve));
    reconnectedSocket.emit("join-room", ROOM_ID_2);

    let syncState = null;
    await new Promise((resolve) => {
      reconnectedSocket.emit("payment:sync", { roomId: ROOM_ID_2 }, (ack) => {
        syncState = ack.negotiation;
        resolve(true);
      });
    });

    assert(syncState, "Synced state recovered after reconnection");
    assert.strictEqual(syncState.offers[syncState.offers.length - 1].amount, 950);
    // Ensure no duplicate offers created
    const offerIds = syncState.offers.map((o) => o.offerId);
    const uniqueIds = new Set(offerIds);
    assert.strictEqual(offerIds.length, uniqueIds.size, "No duplicate offers exist after reconnection");
    console.log(`✓ [TEST E PASSED] Reconnection successfully synced state (latest amount: $950, unique offers: ${uniqueIds.size})`);

    // ---------------------------------------------------------
    // TEST F: Regression (PayPal Invoice & Paid Stamp Broadcast)
    // ---------------------------------------------------------
    console.log("\n[TEST F] Regression (PayPal Invoice & Webhook Paid Stamp)...");
    // Accept deal
    await new Promise((resolve) => {
      reconnectedSocket.emit(
        "payment:accept",
        {
          negotiationId: neg2Id,
          offerId: syncState.offers[syncState.offers.length - 1].offerId,
        },
        () => resolve(true)
      );
    });
    await sleep(200);

    // Create PayPal Invoice
    const invRes = await fetch(`${BASE_URL}/api/negotiation/${neg2Id}/create-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sellerName: "Alice Design Studio",
        customerName: "Bob Collaborator",
        customerEmail: "bob@example.com",
        senderSocketId: hostSocket.id,
      }),
    });
    assert.strictEqual(invRes.status, 201);
    const invData = await invRes.json();
    assert(invData.invoice.paypalInvoiceId);

    // Send PayPal Invoice
    const sendRes = await fetch(`${BASE_URL}/api/negotiation/${neg2Id}/send-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderSocketId: hostSocket.id }),
    });
    assert.strictEqual(sendRes.status, 200);
    const sentData = await sendRes.json();
    assert.strictEqual(sentData.negotiation.status, "PAYMENT_PENDING");

    // Webhook PAID confirmation
    let paidHostReceived = null;
    let paidCollabReceived = null;
    hostSocket.on("payment:paid", (data) => { paidHostReceived = data; });
    reconnectedSocket.on("payment:paid", (data) => { paidCollabReceived = data; });

    await fetch(`${BASE_URL}/api/paypal/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: `WH-REALTIME-${Date.now()}`,
        event_type: "INVOICING.INVOICE.PAID",
        resource: {
          id: invData.invoice.paypalInvoiceId,
          status: "PAID",
          amount: { value: "950.00", currency_code: "USD" },
        },
      }),
    });
    await sleep(300);

    assert(paidHostReceived, "Host received real-time payment:paid event");
    assert(paidCollabReceived, "Collaborator received real-time payment:paid event");
    assert.strictEqual(paidHostReceived.amountPaid, 950);
    console.log("✓ [TEST F PASSED] PayPal Invoice & Verified PAID stamp arrived in real-time on both canvases");

    hostSocket.disconnect();
    reconnectedSocket.disconnect();

    console.log("\n=======================================================================");
    console.log("🎉 ALL REAL-TIME SYNCHRONIZATION TESTS (A THROUGH F) PASSED! 🎉");
    console.log("=======================================================================\n");
  } finally {
    serverProcess.kill();
  }
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
