import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Excalidraw, MainMenu, serializeAsJSON } from "@excalidraw/excalidraw";
import { FolderOpen, Sparkles } from "lucide-react";

import AIAssistPanel from "./AIAssistPanel";
import { editor, focusDrawingEditor, parseScene } from "../editorState";
import { storage } from "../storage";

export default function DrawingEditor({
  fileName,
  theme,
  onThemeChange,
  onOpenExplorer,
  explorer,
}) {
  const initialData = useMemo(
    () => parseScene(storage.read(fileName)),
    [fileName],
  );
  const timerRef = useRef(null);
  const latestRef = useRef(null);
  const flushRef = useRef(() => {});
  const [api, setApi] = useState(null);
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  // Chat lives here so closing and reopening the panel keeps it (per drawing, per session).
  const [aiMessages, setAiMessages] = useState([]);
  // Canvas selection shown in the AI Assist panel: { elements, files } or null.
  const [aiSelection, setAiSelection] = useState(null);
  const aiSelectionKeyRef = useRef("");
  const [toolbarSlot] = useState(() => {
    const slot = document.createElement("div");
    slot.className = "ai-assist-toolbar-slot";
    return slot;
  });

  // Excalidraw has no API for extra toolbar buttons, so keep a slot right after
  // its "More tools" button and portal ours into it. The observer puts the slot
  // back whenever Excalidraw rebuilds the toolbar (mobile/desktop switch, etc.).
  useEffect(() => {
    const slot = toolbarSlot;

    const place = () => {
      const trigger = document.querySelector(
        ".excalidraw .App-toolbar__extra-tools-trigger",
      );
      if (trigger && trigger.nextElementSibling !== slot) trigger.after(slot);
    };

    place();
    const observer = new MutationObserver(place);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      slot.remove();
    };
  }, [toolbarSlot]);

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

  // Push the current selection to the AI Assist panel, but only when it
  // actually changes (different elements, or a selected element was edited).
  const syncAiSelection = (elements, appState, files) => {
    const ids = appState?.selectedElementIds ?? {};
    const selected = elements.filter(
      (el) =>
        !el.isDeleted &&
        // Bound text (e.g. a label inside a rectangle) comes with its container.
        (ids[el.id] || (el.containerId && ids[el.containerId])),
    );
    const key = selected.map((el) => `${el.id}:${el.version}`).join("|");
    if (key === aiSelectionKeyRef.current) return;
    aiSelectionKeyRef.current = key;
    setAiSelection(selected.length ? { elements: selected, files } : null);
  };

  const handleChange = (elements, appState, files) => {
    if (appState?.theme) onThemeChange(appState.theme);
    if (aiAssistOpen) syncAiSelection(elements, appState, files);
    latestRef.current = { elements, appState, files };
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => flushRef.current(), 800);
  };

  return (
    <>
      <Excalidraw
        initialData={initialData}
        onChange={handleChange}
        excalidrawAPI={setApi}
        // App owns the theme (starts from the Android app's choice). Passing
        // `theme` hides Excalidraw's own toggle by default, so turn it back on;
        // toggling reports the new theme through onChange -> onThemeChange.
        theme={theme}
        UIOptions={{ canvasActions: { toggleTheme: true } }}
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
        {explorer(api)}
      </Excalidraw>
      {createPortal(
        <button
          type="button"
          className={`dropdown-menu-button ai-assist-toolbar-button zen-mode-transition ${
            aiAssistOpen ? "is-active" : ""
          }`}
          title="AI Assist Analyzer"
          aria-label="AI Assist Analyzer"
          aria-pressed={aiAssistOpen}
          // Don't let the button take focus: the drawing editor keeps it.
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (!aiAssistOpen && api) {
              // Pick up whatever is already selected when the panel opens.
              syncAiSelection(
                api.getSceneElements(),
                api.getAppState(),
                api.getFiles(),
              );
            }
            setAiAssistOpen((open) => !open);
            focusDrawingEditor();
          }}
        >
          <Sparkles size={18} strokeWidth={1.5} />
        </button>,
        toolbarSlot,
      )}
      {aiAssistOpen && (
        <AIAssistPanel
          messages={aiMessages}
          setMessages={setAiMessages}
          selection={aiSelection}
          theme={theme}
          onClose={() => setAiAssistOpen(false)}
        />
      )}
    </>
  );
}
