import { useEffect, useMemo, useRef, useState } from "react";
import {
  Excalidraw,
  LiveCollaborationTrigger,
  MainMenu,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import { FolderOpen } from "lucide-react";

import CollaborationDialog from "./CollaborationDialog";
import { createRoomId, useCollaboration } from "../collaboration";
import { editor, parseScene } from "../editorState";
import { storage } from "../storage";

export default function DrawingEditor({
  fileName,
  onThemeChange,
  onOpenExplorer,
  explorer,
}) {
  const initialData = useMemo(() => parseScene(storage.read(fileName)), [fileName]);
  const timerRef = useRef(null);
  const latestRef = useRef(null);
  const flushRef = useRef(() => {});
  const [api, setApi] = useState(null);
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [collaborationDialogOpen, setCollaborationDialogOpen] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [userName] = useState(() => `Guest-${createRoomId().slice(0, 4)}`);
  const collaboration = useCollaboration({ api, roomId, userName });

  useEffect(() => {
    const flush = () => {
      window.clearTimeout(timerRef.current);
      const latest = latestRef.current;
      if (!latest) return;

      const serialized = serializeAsJSON(
        latest.elements,
        latest.appState,
        latest.files,
        "local",
      );
      storage.write(fileName, serialized);
      latestRef.current = null;
    };

    flushRef.current = flush;
    editor.flush = flush;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flush();
      if (editor.flush === flush) editor.flush = () => {};
    };
  }, [fileName]);

  const handleChange = (elements, appState, files) => {
    if (appState?.theme) onThemeChange(appState.theme);
    latestRef.current = { elements, appState, files };
    if (collaboration.shouldBroadcast()) collaboration.queueScene();
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => flushRef.current(), 800);
  };

  const joinRoom = (requestedRoomId) => {
    const nextRoomId = requestedRoomId.trim();
    if (!nextRoomId) return;
    setRoomId(nextRoomId);
    setIsCollaborating(true);
  };

  const leaveRoom = () => {
    setRoomId("");
    setIsCollaborating(false);
  };

  return (
    <Excalidraw
      initialData={initialData}
      onChange={handleChange}
      excalidrawAPI={setApi}
      isCollaborating={isCollaborating && collaboration.status === "connected"}
      onPointerUpdate={collaboration.sendPointer}
      renderTopRightUI={() => (
        <LiveCollaborationTrigger
          isCollaborating={isCollaborating && collaboration.status === "connected"}
          onSelect={() => {
            setIsCollaborating(false);
            setCollaborationDialogOpen(true);
          }}
        />
      )}
    >
      <MainMenu>
        <MainMenu.Item
          icon={<FolderOpen size={16} strokeWidth={1.8} />}
          onClick={onOpenExplorer}
        >
          Drawing Explorer
        </MainMenu.Item>
        <MainMenu.Separator />
        <MainMenu.DefaultItems.LoadScene />
        <MainMenu.DefaultItems.SaveToActiveFile />
        <MainMenu.DefaultItems.Export />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.DefaultItems.Help />
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.Separator />
        <MainMenu.Group title="Excalidraw links">
          <MainMenu.DefaultItems.Socials />
        </MainMenu.Group>
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ToggleTheme />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      </MainMenu>
      {collaborationDialogOpen ? (
        <CollaborationDialog
          roomId={roomId}
          status={collaboration.status}
          error={collaboration.error}
          onJoin={joinRoom}
          onLeave={leaveRoom}
          onClose={() => {
            setCollaborationDialogOpen(false);
          }}
        />
      ) : null}
      {explorer(api, () => setCollaborationDialogOpen(true))}
    </Excalidraw>
  );
}
