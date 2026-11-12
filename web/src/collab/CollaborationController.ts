import {
  CaptureUpdateAction,
  reconcileElements,
  restoreElements,
  type ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw";
import type {
  Collaborator,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import throttle from "lodash.throttle";

import { CURSOR_SYNC_TIMEOUT, WS_SUBTYPES } from "../components/app_constants";
import type { SocketUpdateDataSource } from "./liveData";
import { isSyncableElement } from "./liveData";
import { decryptLiveData } from "./liveCrypto";
import { generateRoomLinkData, getRoomLink, getRoomLinkData } from "./roomLink";
import Portal, { type PortalCollab } from "./Portal";

const COLLABORATION_SERVER =
  import.meta.env.VITE_COLLAB_SERVER_URL ||
  (import.meta.env.DEV
    ? "http://localhost:3002"
    : "https://oss-collab.excalidraw.com");

type SceneAPI = Pick<
  ExcalidrawImperativeAPI,
  | "getSceneElementsIncludingDeleted"
  | "getAppState"
  | "getFiles"
  | "updateScene"
>;

const noImageFileManager = {
  saveFiles: async () => ({ savedFiles: new Map(), erroredFiles: new Map() }),
  shouldUpdateImageElementStatus: () => false,
};

/** Firebase-free live collaboration for one existing Excalidraw instance. */
export default class CollaborationController {
  private readonly api: SceneAPI;
  private readonly portal: Portal;
  private readonly collaborators = new Map<SocketId, Collaborator>();
  private socket: Socket | null = null;
  private applyingRemoteScene = false;
  private sceneVersion = -1;
  private username = "Calidraw user";

  constructor(api: SceneAPI) {
    this.api = api;
    const adapter: PortalCollab = {
      excalidrawAPI: api,
      fileManager: noImageFileManager,
      state: { username: this.username },
      getSceneElementsIncludingDeleted: () =>
        this.api.getSceneElementsIncludingDeleted(),
      setCollaborators: (socketIds) => this.setCollaborators(socketIds),
    };
    this.portal = new Portal(adapter);
  }

  get activeRoomLink() {
    if (!this.portal.roomId || !this.portal.roomKey) return null;
    return getRoomLink({
      roomId: this.portal.roomId,
      roomKey: this.portal.roomKey,
    });
  }

  async createRoom() {
    const room = await generateRoomLinkData();
    const generatedLink = getRoomLink(room);
    window.history.pushState({}, document.title, generatedLink);
    await this.connect(room.roomId, room.roomKey);
    return window.location.href;
  }

  async joinRoom(link = window.location.href) {
    const room = getRoomLinkData(link);
    if (!room) {
      throw new Error("Invalid collaboration link");
    }
    window.history.replaceState({}, document.title, link);
    await this.connect(room.roomId, room.roomKey);
    return this.activeRoomLink;
  }

  async joinRoomFromHash() {
    const room = getRoomLinkData(window.location.href);
    console.info("Calidraw collaboration hash detection", {
      pathname: window.location.pathname,
      hasRoomHash: window.location.hash.startsWith("#room="),
      roomId: room?.roomId ?? null,
      encryptionKeyLength: room?.roomKey.length ?? 0,
    });
    if (room) {
      return this.joinRoom();
    }
    return null;
  }

  syncElements = (elements: readonly OrderedExcalidrawElement[]) => {
    if (
      !this.socket ||
      !this.portal.socketInitialized ||
      this.applyingRemoteScene
    ) {
      return;
    }

    const nextVersion = elements.reduce(
      (version, element) => Math.max(version, element.version),
      -1,
    );
    if (nextVersion <= this.sceneVersion) return;

    this.sceneVersion = nextVersion;
    void this.portal.broadcastScene(WS_SUBTYPES.UPDATE, elements, false);
  };

  close() {
    this.socket?.off("client-broadcast", this.handleClientBroadcast);
    this.socket?.off("first-in-room", this.handleFirstInRoom);
    this.socket?.off("connect_error", this.handleConnectError);
    this.portal.close();
    this.socket = null;
    this.collaborators.clear();
    this.api.updateScene({ collaborators: new Map() });
  }

  private connect = async (roomId: string, roomKey: string) => {
    if (this.socket) return;

    console.log("Calidraw collaboration server URL:", COLLABORATION_SERVER);
    const socket = io(COLLABORATION_SERVER, {
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => {
      console.log("Calidraw collaboration connected", {
        transport: socket.io.engine?.transport?.name,
      });
    });
    socket.on("connect_error", (error) => {
      console.error("Calidraw collaboration connect_error", error);
    });
    socket.on("disconnect", (reason) => {
      console.warn("Calidraw collaboration disconnected", reason);
    });
    this.socket = this.portal.open(socket, roomId, roomKey);
    this.socket.on("client-broadcast", this.handleClientBroadcast);
    this.socket.once("first-in-room", this.handleFirstInRoom);
    this.socket.once("connect_error", this.handleConnectError);
  };

  private handleConnectError = (error: Error) => {
    console.error("Calidraw collaboration connection failed", error);
    window.dispatchEvent(
      new CustomEvent("calidraw-collaboration-error", { detail: error }),
    );
  };

  private handleFirstInRoom = () => {
    this.portal.socketInitialized = true;
    this.sceneVersion = this.getSceneVersion(
      this.api.getSceneElementsIncludingDeleted(),
    );
  };

  private handleClientBroadcast = async (
    encryptedData: ArrayBuffer,
    iv: Uint8Array,
  ) => {
    if (!this.portal.roomKey) return;

    try {
      const decrypted = await this.decryptPayload(
        encryptedData,
        iv,
        this.portal.roomKey,
      );
      switch (decrypted.type) {
        case WS_SUBTYPES.INIT:
        case WS_SUBTYPES.UPDATE:
          this.applyRemoteElements(decrypted.payload.elements);
          break;
        case WS_SUBTYPES.MOUSE_LOCATION:
          this.updateCollaborator(decrypted.payload.socketId, {
            pointer: decrypted.payload.pointer,
            button: decrypted.payload.button,
            selectedElementIds: decrypted.payload.selectedElementIds,
            username: decrypted.payload.username,
          });
          break;
        case WS_SUBTYPES.IDLE_STATUS:
          this.updateCollaborator(decrypted.payload.socketId, {
            userState: decrypted.payload.userState,
            username: decrypted.payload.username,
          });
          break;
        case WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS:
        case WS_SUBTYPES.INVALID_RESPONSE:
          break;
        default:
          throw new Error("Unknown collaboration payload");
      }
    } catch (error) {
      console.error("Calidraw collaboration payload failed", error);
    }
  };

  private async decryptPayload(
    encryptedData: ArrayBuffer,
    iv: Uint8Array,
    roomKey: string,
  ): Promise<SocketUpdateDataSource[keyof SocketUpdateDataSource]> {
    const decrypted = await decryptLiveData(iv, encryptedData, roomKey);
    return JSON.parse(
      new TextDecoder().decode(new Uint8Array(decrypted)),
    ) as SocketUpdateDataSource[keyof SocketUpdateDataSource];
  }

  private applyRemoteElements = (
    remoteElements: readonly ExcalidrawElement[],
  ) => {
    const localElements = this.api.getSceneElementsIncludingDeleted();
    const restored = restoreElements(remoteElements, null);
    const reconciled = reconcileElements(
      localElements,
      restored as OrderedExcalidrawElement[],
      this.api.getAppState(),
    );

    this.sceneVersion = this.getSceneVersion(reconciled);
    this.applyingRemoteScene = true;
    try {
      this.api.updateScene({
        elements: reconciled,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    } finally {
      this.applyingRemoteScene = false;
    }
  };

  private setCollaborators = (socketIds: SocketId[]) => {
    const next = new Map<SocketId, Collaborator>();
    for (const socketId of socketIds) {
      next.set(socketId, {
        ...this.collaborators.get(socketId),
        isCurrentUser: socketId === this.socket?.id,
      });
    }
    this.collaborators.clear();
    next.forEach((value, key) => this.collaborators.set(key, value));
    this.api.updateScene({ collaborators: next });
  };

  private updateCollaborator = (
    socketId: SocketId,
    updates: Partial<Collaborator>,
  ) => {
    const next = new Map(this.collaborators);
    next.set(socketId, {
      ...next.get(socketId),
      ...updates,
      isCurrentUser: socketId === this.socket?.id,
    });
    this.collaborators.clear();
    next.forEach((value, key) => this.collaborators.set(key, value));
    this.api.updateScene({ collaborators: next });
  };

  onPointerUpdate = throttle(
    (payload: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
      pointersMap: Map<number, unknown>;
    }) => {
      if (payload.pointersMap.size < 2) {
        this.portal.broadcastMouseLocation(payload);
      }
    },
    CURSOR_SYNC_TIMEOUT,
  );

  private getSceneVersion = (elements: readonly OrderedExcalidrawElement[]) =>
    elements.reduce(
      (version, element) =>
        isSyncableElement(element) ? Math.max(version, element.version) : version,
      -1,
    );
}

export { COLLABORATION_SERVER };
