# Calidraw collaboration server

This WebSocket transport keeps room state in memory, broadcasts scene updates
and cursor presence, and removes rooms when the last participant leaves.

Run it with:

```bash
npm install
npm start
```

Configure the web app with `VITE_COLLABORATION_SERVER_URL`, for example:

```bash
VITE_COLLABORATION_SERVER_URL=ws://192.168.1.20:8787 yarn dev
```

For production and Android devices, deploy the server behind TLS and use a
`wss://` URL. This starter server has no authentication or durable storage.
