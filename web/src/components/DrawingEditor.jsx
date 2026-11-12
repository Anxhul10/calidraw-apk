import { useEffect, useMemo, useRef, useState } from "react";
import {
  Excalidraw,
  MainMenu,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import { FolderOpen } from "lucide-react";

import { editor, parseScene } from "../editorState";
import { storage } from "../storage";
import BillingDetails from "./BillingDetails";

function getSelectionSignature(elements, appState) {
  const selectedIds = appState?.selectedElementIds ?? {};
  const ids = Object.keys(selectedIds)
    .filter((id) => selectedIds[id])
    .sort();

  return JSON.stringify(
    ids.map((id) => {
      const element = elements.find((candidate) => candidate.id === id);
      return [
        id,
        element?.version ?? null,
        element?.versionNonce ?? null,
        element?.groupIds ?? null,
        element?.customData?.billing ?? null,
      ];
    }),
  );
}

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
  const [selection, setSelection] = useState({
    elements: initialData?.elements ?? [],
    appState: initialData?.appState ?? null,
  });
  const selectionSignatureRef = useRef(
    getSelectionSignature(selection.elements, selection.appState),
  );

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
    const nextSelectionSignature = getSelectionSignature(elements, appState);
    if (selectionSignatureRef.current !== nextSelectionSignature) {
      selectionSignatureRef.current = nextSelectionSignature;
      setSelection({ elements, appState });
    }
    latestRef.current = { elements, appState, files };
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => flushRef.current(), 800);
  };

  return (
    <Excalidraw
      initialData={initialData}
      onChange={handleChange}
      excalidrawAPI={setApi}
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
      <BillingDetails
        api={api}
        elements={selection.elements}
        appState={selection.appState}
      />
      {explorer(api)}
    </Excalidraw>
  );
}
