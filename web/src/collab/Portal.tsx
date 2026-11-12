import type { SocketUpdateData, SocketUpdateDataSource, SyncableExcalidrawElement } from "./liveData";
import { isSyncableElement } from "./liveData";

import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { WS_EVENTS, FILE_UPLOAD_TIMEOUT, WS_SUBTYPES } from "../components/app_constants";
import type {
  OnUserFollowedPayload,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type { UserIdleState } from "@excalidraw/excalidraw/constants";
import throttle from "lodash.throttle";
import { encryptLiveData } from "./liveCrypto";
import type { Socket } from "socket.io-client";

export type PortalCollab = {
  excalidrawAPI: {
    getSceneElementsIncludingDeleted: () => readonly OrderedExcalidrawElement[];
    getFiles: () => Record<string, unknown>;
    getAppState: () => { selectedElementIds: Record<string, boolean> };
    updateScene: (sceneData: {
      elements?: readonly OrderedExcalidrawElement[];
      appState?: Record<string, unknown>;
      captureUpdate?: string;
    }) => void;
  };
  fileManager: {
    saveFiles: (data: unknown) => Promise<unknown>;
    shouldUpdateImageElementStatus: (element: OrderedExcalidrawElement) => boolean;
  };
  state: { username: string };
  getSceneElementsIncludingDeleted: () => readonly OrderedExcalidrawElement[];
  setCollaborators: (socketIds: SocketId[]) => void;
};

class Portal {
  collab: PortalCollab;
  socket: Socket | null = null;
  socketInitialized: boolean = false; // we don't want the socket to emit any updates until it is fully initialized
  roomId: string | null = null;
  roomKey: string | null = null;
  broadcastedElementVersions: Map<string, number> = new Map();

  constructor(collab: PortalCollab) {
    this.collab = collab;
  }

  open(socket: Socket, id: string, key: string) {
    this.socket = socket;
    this.roomId = id;
    this.roomKey = key;

    // Initialize socket listeners
    this.socket.on("init-room", this.handleInitRoom);
    this.socket.on("new-user", this.handleNewUser);
    this.socket.on("room-user-change", this.handleRoomUserChange);

    return socket;
  }

  close() {
    if (!this.socket) {
      return;
    }
    this.queueFileUpload.flush();
    this.socket.off("init-room", this.handleInitRoom);
    this.socket.off("new-user", this.handleNewUser);
    this.socket.off("room-user-change", this.handleRoomUserChange);
    this.socket.close();
    this.socket = null;
    this.roomId = null;
    this.roomKey = null;
    this.socketInitialized = false;
    this.broadcastedElementVersions = new Map();
  }

  private handleInitRoom = () => {
    this.socket?.emit("join-room", this.roomId);
  };

  private handleNewUser = () => {
    void this.broadcastScene(
      WS_SUBTYPES.INIT,
      this.collab.getSceneElementsIncludingDeleted(),
      true,
    );
  };

  private handleRoomUserChange = (clients: SocketId[]) => {
    this.collab.setCollaborators(clients);
  };

  isOpen() {
    return !!(
      this.socketInitialized &&
      this.socket &&
      this.roomId &&
      this.roomKey
    );
  }

  async _broadcastSocketData(
    data: SocketUpdateData,
    volatile: boolean = false,
    roomId?: string,
  ) {
    if (this.isOpen()) {
      const json = JSON.stringify(data);
      const encoded = new TextEncoder().encode(json);
      const { encryptedBuffer, iv } = await encryptLiveData(this.roomKey!, encoded);

      this.socket?.emit(
        volatile ? WS_EVENTS.SERVER_VOLATILE : WS_EVENTS.SERVER,
        roomId ?? this.roomId,
        encryptedBuffer,
        iv,
      );
    }
  }

  queueFileUpload = throttle(() => {}, FILE_UPLOAD_TIMEOUT);

  broadcastScene = async (
    updateType: WS_SUBTYPES.INIT | WS_SUBTYPES.UPDATE,
    elements: readonly OrderedExcalidrawElement[],
    syncAll: boolean,
  ) => {
    if (updateType === WS_SUBTYPES.INIT && !syncAll) {
      throw new Error("syncAll must be true when sending SCENE.INIT");
    }

    // sync out only the elements we think we need to to save bandwidth.
    // periodically we'll resync the whole thing to make sure no one diverges
    // due to a dropped message (server goes down etc).
    const syncableElements = elements.reduce((acc, element) => {
      if (
        (syncAll ||
          !this.broadcastedElementVersions.has(element.id) ||
          element.version > this.broadcastedElementVersions.get(element.id)!) &&
        isSyncableElement(element)
      ) {
        acc.push(element);
      }
      return acc;
    }, [] as SyncableExcalidrawElement[]);

    const data: SocketUpdateDataSource[typeof updateType] = {
      type: updateType,
      payload: {
        elements: syncableElements,
      },
    };

    for (const syncableElement of syncableElements) {
      this.broadcastedElementVersions.set(
        syncableElement.id,
        syncableElement.version,
      );
    }

    this.queueFileUpload();

    await this._broadcastSocketData(data as SocketUpdateData);
  };

  broadcastIdleChange = (userState: UserIdleState) => {
    if (this.socket?.id) {
      const data: SocketUpdateDataSource["IDLE_STATUS"] = {
        type: WS_SUBTYPES.IDLE_STATUS,
        payload: {
          socketId: this.socket.id as SocketId,
          userState,
          username: this.collab.state.username,
        },
      };
      return this._broadcastSocketData(
        data as SocketUpdateData,
        true, // volatile
      );
    }
  };

  broadcastMouseLocation = (payload: {
    pointer: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["pointer"];
    button: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["button"];
  }) => {
    if (this.socket?.id) {
      const data: SocketUpdateDataSource["MOUSE_LOCATION"] = {
        type: WS_SUBTYPES.MOUSE_LOCATION,
        payload: {
          socketId: this.socket.id as SocketId,
          pointer: payload.pointer,
          button: payload.button || "up",
          selectedElementIds:
            this.collab.excalidrawAPI.getAppState().selectedElementIds,
          username: this.collab.state.username,
        },
      };

      return this._broadcastSocketData(
        data as SocketUpdateData,
        true, // volatile
      );
    }
  };

  broadcastVisibleSceneBounds = (
    payload: {
      sceneBounds: SocketUpdateDataSource["USER_VISIBLE_SCENE_BOUNDS"]["payload"]["sceneBounds"];
    },
    roomId: string,
  ) => {
    if (this.socket?.id) {
      const data: SocketUpdateDataSource["USER_VISIBLE_SCENE_BOUNDS"] = {
        type: WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS,
        payload: {
          socketId: this.socket.id as SocketId,
          username: this.collab.state.username,
          sceneBounds: payload.sceneBounds,
        },
      };

      return this._broadcastSocketData(
        data as SocketUpdateData,
        true, // volatile
        roomId,
      );
    }
  };

  broadcastUserFollowed = (payload: OnUserFollowedPayload) => {
    if (this.socket?.id) {
      this.socket.emit(WS_EVENTS.USER_FOLLOW_CHANGE, payload);
    }
  };
}

export default Portal;
