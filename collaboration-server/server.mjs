import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 8787);
const rooms = new Map();

function roomFor(id) {
  if (!rooms.has(id)) rooms.set(id, { scene: null, clients: new Map() });
  return rooms.get(id);
}

function send(socket, message) {
  if (socket.readyState === 1) socket.send(JSON.stringify(message));
}

function broadcast(room, message, except = null) {
  for (const client of room.clients.keys()) {
    if (client !== except) send(client, message);
  }
}

function presence(room) {
  return [...room.clients.values()].map(({ id, userName, color }) => ({
    id,
    userName,
    color,
  }));
}

const httpServer = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("Calidraw collaboration server\n");
});

const webSocketServer = new WebSocketServer({ server: httpServer });

webSocketServer.on("connection", (socket) => {
  const client = {
    socket,
    id: randomUUID(),
    roomId: null,
    userName: "Anonymous",
    color: "#6965db",
  };

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === "join") {
      const roomId = String(message.roomId || "").trim().slice(0, 100);
      if (!roomId) return send(socket, { type: "error", message: "A room ID is required." });

      const room = roomFor(roomId);
      client.roomId = roomId;
      client.userName = String(message.userName || "Anonymous").slice(0, 60);
      room.clients.set(socket, client);

      if (room.scene) send(socket, { type: "snapshot", scene: room.scene });
      else if (message.scene) room.scene = message.scene;

      broadcast(room, { type: "presence", users: presence(room) });
      return;
    }

    const room = client.roomId ? rooms.get(client.roomId) : null;
    if (!room) return;

    if (message.type === "scene" && message.scene) {
      room.scene = message.scene;
      broadcast(room, { type: "snapshot", scene: room.scene }, socket);
    }

    if (message.type === "pointer") {
      broadcast(room, {
        type: "pointer",
        userId: client.id,
        userName: client.userName,
        pointer: message.pointer,
        button: message.button,
      }, socket);
    }
  });

  socket.on("close", () => {
    const room = client.roomId ? rooms.get(client.roomId) : null;
    if (!room) return;
    room.clients.delete(socket);
    if (room.clients.size === 0) rooms.delete(client.roomId);
    else broadcast(room, { type: "presence", users: presence(room) });
  });
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Calidraw collaboration server listening on ws://0.0.0.0:${port}`);
});
