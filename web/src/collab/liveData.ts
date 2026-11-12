import { isInvisiblySmallElement } from "@excalidraw/excalidraw";
import type { SceneBounds } from "@excalidraw/excalidraw/element/bounds";
import type { AppState, SocketId } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { UserIdleState } from "@excalidraw/excalidraw/constants";
import type { WS_SUBTYPES } from "../components/app_constants";

export type SyncableExcalidrawElement = OrderedExcalidrawElement;
export const isSyncableElement = (element: OrderedExcalidrawElement) =>
  element.isDeleted
    ? element.updated > Date.now() - 24 * 60 * 60 * 1000
    : !isInvisiblySmallElement(element);

export type SocketUpdateDataSource = {
  INVALID_RESPONSE: { type: WS_SUBTYPES.INVALID_RESPONSE };
  SCENE_INIT: { type: WS_SUBTYPES.INIT; payload: { elements: readonly ExcalidrawElement[] } };
  SCENE_UPDATE: { type: WS_SUBTYPES.UPDATE; payload: { elements: readonly ExcalidrawElement[] } };
  MOUSE_LOCATION: { type: WS_SUBTYPES.MOUSE_LOCATION; payload: { socketId: SocketId; pointer: { x: number; y: number; tool: "pointer" | "laser" }; button: "down" | "up"; selectedElementIds: AppState["selectedElementIds"]; username: string } };
  USER_VISIBLE_SCENE_BOUNDS: { type: WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS; payload: { socketId: SocketId; username: string; sceneBounds: SceneBounds } };
  IDLE_STATUS: { type: WS_SUBTYPES.IDLE_STATUS; payload: { socketId: SocketId; userState: UserIdleState; username: string } };
};
export type SocketUpdateData = SocketUpdateDataSource[keyof SocketUpdateDataSource];
