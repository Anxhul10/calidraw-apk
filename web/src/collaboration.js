import { useCallback, useEffect, useRef, useState } from "react";

const defaultEndpoint = "ws://localhost:8787";

function endpoint() {
  return import.meta.env.VITE_COLLABORATION_SERVER_URL || defaultEndpoint;
}

function sceneFromApi(api) {
  if (!api) return null;

  const appState = api.getAppState();
  return {
    elements: api.getSceneElements(),
    files: api.getFiles(),
    appState: {
      theme: appState.theme,
      viewBackgroundColor: appState.viewBackgroundColor,
    },
  };
}

export function createRoomId() {
  const value = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return value.replace(/-/g, "").slice(0, 10);
}

export function useCollaboration({ api, roomId, userName }) {
  const socketRef = useRef(null);
  const remoteUpdateRef = useRef(false);
  const sceneTimerRef = useRef(null);
  const collaboratorsRef = useRef(new Map());
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [collaborators, setCollaborators] = useState(new Map());

  const send = useCallback((message) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  const sendScene = useCallback(() => {
    if (remoteUpdateRef.current || !api || !roomId) return;
    const scene = sceneFromApi(api);
    if (scene) send({ type: "scene", scene });
  }, [api, roomId, send]);

  const queueScene = useCallback(() => {
    window.clearTimeout(sceneTimerRef.current);
    sceneTimerRef.current = window.setTimeout(sendScene, 75);
  }, [sendScene]);

  const shouldBroadcast = useCallback(() => !remoteUpdateRef.current, []);

  const sendPointer = useCallback(
    (payload) => {
      if (status !== "connected") return;
      send({ type: "pointer", pointer: payload.pointer, button: payload.button });
    },
    [send, status],
  );

  useEffect(() => {
    if (!api || !roomId) {
      socketRef.current?.close();
      socketRef.current = null;
      return undefined;
    }

    const socket = new WebSocket(endpoint());
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus("connected");
      send({
        type: "join",
        roomId,
        userName: userName || "Anonymous",
        scene: sceneFromApi(api),
      });
    };

    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === "snapshot" && message.scene) {
        remoteUpdateRef.current = true;
        api.updateScene({
          elements: message.scene.elements ?? [],
          appState: message.scene.appState ?? {},
          files: message.scene.files ?? {},
        });
        window.setTimeout(() => {
          remoteUpdateRef.current = false;
        }, 0);
      }

      if (message.type === "presence") {
        const next = new Map(
          (message.users ?? []).map((user) => [user.id, {
            username: user.userName,
            socketId: user.id,
            color: user.color,
            isCurrentUser: false,
          }]),
        );
        collaboratorsRef.current = next;
        setCollaborators(next);
        api.updateScene({ collaborators: next });
      }

      if (message.type === "pointer" && message.userId) {
        const next = new Map(collaboratorsRef.current);
        const current = next.get(message.userId) ?? {
          username: message.userName,
          socketId: message.userId,
        };
        next.set(message.userId, {
          ...current,
          pointer: message.pointer,
          button: message.button,
        });
        collaboratorsRef.current = next;
        setCollaborators(next);
        api.updateScene({ collaborators: next });
      }
    };

    socket.onerror = () => {
      setStatus("error");
      setError(`Unable to connect to the collaboration server at ${endpoint()}.`);
    };

    socket.onclose = () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
        setStatus("error");
        setError((current) => current || "The collaboration connection was closed.");
        collaboratorsRef.current = new Map();
        setCollaborators(new Map());
      }
    };

    return () => {
      window.clearTimeout(sceneTimerRef.current);
      if (socketRef.current === socket) socketRef.current = null;
      socket.close();
    };
  }, [api, roomId, send, userName]);

  return {
    status: roomId ? (status === "idle" ? "connecting" : status) : "idle",
    error,
    collaborators,
    queueScene,
    sendPointer,
    shouldBroadcast,
  };
}
