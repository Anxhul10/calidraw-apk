/* global process */
import assert from "assert";
import cp from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("Starting server for integration testing...");
  const serverProcess = cp.spawn(
    "node",
    ["server/excalidraw-room/dist/index.js"],
    {
      cwd: __dirname,
      env: { ...process.env, NODE_ENV: "development", PORT: "3003" },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  serverProcess.stdout.on("data", (data) => {
    console.log("[SERVER]", data.toString().trim());
  });
  serverProcess.stderr.on("data", (data) => {
    console.error("[SERVER ERR]", data.toString().trim());
  });

  await sleep(1500);

  const BASE_URL = "http://localhost:3003";

  try {
    // 1. Check health
    const health = await fetch(`${BASE_URL}/`).then((r) => r.text());
    assert(health.includes("Excalidraw collaboration server"), "Health check failed");
    console.log("✓ Health check passed");

    // 2. Generate Invoice with AI (Acceptance criteria 2, 3, 6)
    const genPayload = {
      annotations: [
        { text: "Client: Acme Corporation\nProject: Mobile Banking Redesign" },
        { text: "Auth Flow Design: $3500", type: "text" },
        { text: "Security Audit (2 units): 2000 USD", type: "text" },
        { text: "Biometric Login Component", type: "text" }, // Missing price
      ],
      context: "Fintech project wireframes",
    };

    const genRes = await fetch(`${BASE_URL}/api/invoices/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(genPayload),
    });

    assert.strictEqual(genRes.status, 200, "Generate endpoint status should be 200");
    const genData = await genRes.json();
    assert.strictEqual(genData.success, true, "Generate success should be true");
    assert.strictEqual(genData.draft.clientName, "Acme Corporation", "Client name extracted");
    assert.strictEqual(genData.draft.currency, "USD", "Currency extracted");

    // Verify explicit items vs visual inference
    const authItem = genData.draft.items.find((i) => i.description.includes("Auth Flow"));
    assert(authItem, "Auth flow item extracted");
    assert.strictEqual(authItem.unitPrice, 3500, "Auth flow price extracted explicitly");
    assert.strictEqual(authItem.source, "explicit_annotation");

    const biometricItem = genData.draft.items.find((i) => i.description.includes("Biometric Login"));
    assert(biometricItem, "Biometric item extracted");
    assert.strictEqual(biometricItem.unitPrice, null, "Price must be null when missing (Criteria 6)");
    assert.strictEqual(biometricItem.source, "visual_inference");

    assert(
      genData.draft.missingInformation.some((m) => m.toLowerCase().includes("biometric") && m.toLowerCase().includes("price")),
      "Missing price flagged in missingInformation"
    );
    console.log("✓ AI generation & price rules verified");

    // 3. Save Invoice (Acceptance criteria 7, 8)
    const userA = "user_test_alice";
    const userB = "user_test_bob";

    const savePayload = {
      title: genData.draft.title,
      clientName: genData.draft.clientName,
      currency: genData.draft.currency,
      sceneId: "mobile-banking.excalidraw",
      items: [
        { description: "Auth Flow Design", quantity: 1, unitPrice: 3500 },
        { description: "Security Audit", quantity: 2, unitPrice: 1000 },
        { description: "Biometric Login Component", quantity: 1, unitPrice: 1500 }, // User entered price
      ],
      taxRate: 10, // 10%
      discount: 500,
    };

    const saveRes = await fetch(`${BASE_URL}/api/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": userA },
      body: JSON.stringify(savePayload),
    });

    assert.strictEqual(saveRes.status, 201, "Save status should be 201");
    const saveData = await saveRes.json();
    assert.strictEqual(saveData.success, true);
    assert(saveData.id, "Saved invoice ID returned");

    // Expected: Subtotal = 3500 + 2000 + 1500 = 7000. Tax 10% = 700. Discount = 500. Total = 7200.
    assert.strictEqual(saveData.invoice.subtotal, 7000, "Subtotal calculated on backend");
    assert.strictEqual(saveData.invoice.tax, 700, "Tax calculated on backend");
    assert.strictEqual(saveData.invoice.discount, 500, "Discount recorded");
    assert.strictEqual(saveData.invoice.total, 7200, "Total calculated on backend");
    assert.strictEqual(saveData.invoice.status, "DRAFT", "Initial status DRAFT");
    console.log("✓ Backend calculation & invoice persistence verified");

    // 4. Retrieve Invoices for user A
    const listResA = await fetch(`${BASE_URL}/api/invoices`, {
      headers: { "x-user-id": userA },
    });
    const listDataA = await listResA.json();
    assert.strictEqual(listDataA.success, true);
    assert(listDataA.invoices.some((inv) => inv.id === saveData.id), "User A finds saved invoice");

    // 5. Retrieve Invoices for user B (should be empty for user B)
    const listResB = await fetch(`${BASE_URL}/api/invoices`, {
      headers: { "x-user-id": userB },
    });
    const listDataB = await listResB.json();
    assert.strictEqual(listDataB.invoices.length, 0, "User B should not see user A's invoices");

    // 6. Security & Authorization check (Acceptance criterion 10)
    const unauthGet = await fetch(`${BASE_URL}/api/invoices/${saveData.id}`, {
      headers: { "x-user-id": userB },
    });
    assert.strictEqual(unauthGet.status, 403, "User B accessing user A invoice must return 403 Forbidden");
    console.log("✓ Authorization enforcement verified (403 for unauthorized access)");

    // 7. Authorized user A can retrieve invoice
    const authGet = await fetch(`${BASE_URL}/api/invoices/${saveData.id}`, {
      headers: { "x-user-id": userA },
    });
    assert.strictEqual(authGet.status, 200, "User A accessing own invoice must return 200");
    const authGetData = await authGet.json();
    assert.strictEqual(authGetData.invoice.id, saveData.id);
    console.log("✓ Authorized retrieval verified");

    // 8. Test /api/invoices/enhance endpoint (new workflow)
    const enhancePayload = {
      items: [
        {
          componentId: "elem_1",
          description: "Database schema migration",
          quantity: 2,
          unitPrice: 500,
        },
        {
          componentId: "elem_2",
          description: "Frontend responsive overhaul",
          quantity: 1,
          unitPrice: null, // missing price should be flagged
        },
      ],
      currency: "INR",
      title: "App Modernization",
    };

    const enhanceRes = await fetch(`${BASE_URL}/api/invoices/enhance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": userA },
      body: JSON.stringify(enhancePayload),
    });
    assert.strictEqual(enhanceRes.status, 200, "Enhance endpoint returns 200");
    const enhanceData = await enhanceRes.json();
    assert.strictEqual(enhanceData.success, true);
    assert(enhanceData.draft.title, "Enhanced draft has title");
    assert.strictEqual(enhanceData.draft.items.length, 2, "Maintains exact same item count");
    console.log("✓ AI invoice enhancement endpoint verified");

    console.log("\nALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉");
  } finally {
    serverProcess.kill();
  }
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
