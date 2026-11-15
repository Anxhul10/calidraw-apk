# Calidraw Commerce

This guide explains how to configure PayPal Sandbox, deploy the invoice backend to Render, and connect it to the Calidraw web application hosted on Vercel.

## Architecture

| Component | Platform | Responsibility |
|---|---|---|
| Web application | Vercel | Calidraw UI and canvas |
| Commerce API | Render | AI processing and PayPal integration |
| Collaboration server | Render | Real-time canvas synchronization |
| Payment provider | PayPal Sandbox | Invoice creation and payment |

## 1. Prerequisites

- Node.js 18 or later
- Git
- PayPal Developer account
- Render account
- Vercel account

## 2. Configure PayPal Sandbox

1. Visit https://developer.paypal.com/dashboard/
2. Open **Apps & Credentials**.
3. Select the **Sandbox** environment.
4. Create a REST API application named `Calidraw Commerce`.
5. Copy the generated Client ID and Secret.

### Create sandbox accounts

Visit https://developer.paypal.com/dashboard/accounts/

You need:

- Business account: receives payments.
- Personal account: simulates the customer making payments.

Keep the sandbox credentials separate from your live PayPal credentials.

## 3. Deploy the Commerce API

The repository already contains the invoice backend:

```text
api/
├── package.json
├── server.js
└── .env.example
```

### Deploy using Render

1. Open https://dashboard.render.com/
2. Select **New → Web Service**.
3. Connect your GitHub repository:

   `Anxhul10/calidraw-apk`

4. Configure the service:

| Setting | Value |
|---|---|
| Name | calidraw-commerce-api |
| Branch | develop |
| Root Directory | api |
| Runtime | Node |
| Build Command | npm install |
| Start Command | npm start |

### Configure environment variables

Add the following variables under Render → Environment:

```env
PORT=10000
WEB_ORIGIN=https://calidraw-apk-web.vercel.app

PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=YOUR_SANDBOX_CLIENT_ID
PAYPAL_CLIENT_SECRET=YOUR_SANDBOX_CLIENT_SECRET
```

Replace the placeholders with your actual credentials.

**Security:** Never expose `PAYPAL_CLIENT_SECRET` in frontend code, GitHub commits, or Vite environment variables.

Deploy the service.

## 4. Verify the Backend

After deployment, open:

```text
https://YOUR-API.onrender.com/api/health
```

Expected response:

```json
{
  "status": "ok"
}
```

## 5. Connect the Vercel Frontend

Open your Vercel dashboard and select the Calidraw web project.

Navigate to:

**Settings → Environment Variables**

Configure:

```env
VITE_API_BASE_URL=https://YOUR-API.onrender.com

VITE_COLLAB_SERVER_URL=https://calidraw-room.onrender.com

VITE_APP_PUBLIC_URL=https://calidraw-apk-web.vercel.app
```

Replace `YOUR-API` with your deployed Render service URL.

Keep the collaboration server URL separate from the commerce API URL.

After saving, redeploy the Vercel application so the updated Vite variables are included in the build.

## 6. Test PayPal Invoice Creation

The backend currently supports these endpoints:

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/paypal/invoices` | Create draft invoice |
| POST | `/api/paypal/invoices/:invoiceId/send` | Send invoice |
| GET | `/api/paypal/invoices/:invoiceId` | Retrieve invoice status |

### Create a draft invoice

```bash
curl -X POST \
  https://YOUR-API.onrender.com/api/paypal/invoices \
  -H "Content-Type: application/json" \
  -d '{
    "currency": "USD",
    "seller": {
      "name": "Calidraw Studio"
    },
    "customer": {
      "name": "Test Buyer",
      "email": "YOUR_SANDBOX_BUYER_EMAIL"
    },
    "items": [
      {
        "description": "Logo Design",
        "quantity": 1,
        "unitPrice": 200
      },
      {
        "description": "Website Hosting",
        "quantity": 1,
        "unitPrice": 50
      }
    ]
  }'
```

A successful response contains the PayPal invoice ID.

### Send the invoice

```bash
curl -X POST \
  https://YOUR-API.onrender.com/api/paypal/invoices/INVOICE_ID/send
```

Replace `INVOICE_ID` with the ID returned during invoice creation.

### Check invoice status

```bash
curl \
  https://YOUR-API.onrender.com/api/paypal/invoices/INVOICE_ID
```

The response contains the latest invoice information returned by PayPal.

## 7. Live Collaboration Integration

Calidraw uses a separate collaboration server for shared rooms.

The intended payment synchronization workflow is:

1. A user creates a quotation on the canvas.
2. AI extracts the quotation details.
3. The backend creates a PayPal invoice.
4. The invoice payment link is added to the shared canvas.
5. The customer completes payment through PayPal Sandbox.
6. The backend verifies the payment event.
7. The collaboration server broadcasts the updated payment status.
8. All connected users see the PAID status on their canvases.

Payment events should be broadcast only after server-side verification.

## 8. Environment Variable Reference

| Variable | Location | Description |
|---|---|---|
| `PORT` | Render | Backend listening port |
| `WEB_ORIGIN` | Render | Allowed frontend origin |
| `PAYPAL_ENV` | Render | `sandbox` or `live` |
| `PAYPAL_CLIENT_ID` | Render | PayPal REST application ID |
| `PAYPAL_CLIENT_SECRET` | Render | PayPal REST application secret |
| `VITE_API_BASE_URL` | Vercel | Commerce API base URL |
| `VITE_COLLAB_SERVER_URL` | Vercel | Collaboration server URL |
| `VITE_APP_PUBLIC_URL` | Vercel | Public application URL |

## 9. Troubleshooting

**PayPal authentication failed**

- Verify the Sandbox Client ID.
- Verify the Sandbox Client Secret.
- Ensure `PAYPAL_ENV=sandbox`.

**CORS errors**

- Check that `WEB_ORIGIN` matches the deployed Vercel origin.
- Do not add an unnecessary trailing slash.
- Check browser developer tools for the failing request.

**API not reachable**

- Verify the Render deployment.
- Check Render service logs.
- Visit `/api/health`.
- Allow time for a sleeping free-tier service to start.

**Invoice creation failed**

- Check that the customer email is valid.
- Verify that the currency is USD.
- Inspect the API error response and Render logs.

## 10. Official Documentation

- PayPal Developer Dashboard: https://developer.paypal.com/dashboard/
- PayPal Invoicing API: https://developer.paypal.com/docs/api/invoicing/v2/
- PayPal REST API Authentication: https://developer.paypal.com/api/rest/authentication/
- PayPal Webhooks: https://developer.paypal.com/api/rest/webhooks/
- Render Documentation: https://render.com/docs
- Vercel Environment Variables: https://vercel.com/docs/environment-variables

---

**Project:** Calidraw Commerce  
**Repository:** https://github.com/Anxhul10/calidraw-apk  
**Web Application:** https://calidraw-apk-web.vercel.app/

**Note:** The current backend implements invoice creation, sending and status retrieval. AI extraction, webhook verification and automatic live-room payment broadcasting must be implemented and tested separately before considering the complete commerce workflow production-ready.
