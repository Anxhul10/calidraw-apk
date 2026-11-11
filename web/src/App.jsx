import { useCallback, useState } from "react";

import "@excalidraw/excalidraw/index.css";
import "./App.css";
import "./ExplorerActions.css";
import DrawingEditor from "./components/DrawingEditor";
import Explorer from "./components/Explorer";
import { editor, initializeFiles, uniqueName } from "./editorState";
import { storage } from "./storage";

export default function App() {
  const [files, setFiles] = useState(initializeFiles);
  const [activeFile, setActiveFile] = useState(() => storage.list()[0] ?? null);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [theme, setTheme] = useState("light");

  const refreshFiles = useCallback(() => {
    setFiles(storage.list());
  }, []);

  const openDrawing = (name) => {
    if (name !== activeFile) {
      editor.flush();
      setActiveFile(name);
    }
    setExplorerOpen(false);
  };

  const createDrawing = (requestedName) => {
    const name = uniqueName(requestedName, files);
    if (!name) return;

    editor.flush();
    if (!storage.create(name)) {
      window.alert("Could not create drawing. Check whether this name already exists.");
      refreshFiles();
      return;
    }

    refreshFiles();
    setActiveFile(name);
    setExplorerOpen(false);
  };

  const renameDrawing = (oldName, requestedName) => {
    const newName = uniqueName(requestedName, files, oldName);
    if (!newName || newName === oldName) return;

    editor.flush();
    if (!storage.rename(oldName, newName)) {
      window.alert("Could not rename drawing.");
      refreshFiles();
      return;
    }

    refreshFiles();
    if (activeFile === oldName) setActiveFile(newName);
  };

  const removeDrawing = (name) => {
    if (name === activeFile) editor.flush();

    if (!storage.remove(name)) {
      window.alert("Could not delete drawing.");
      refreshFiles();
      return;
    }

    let remaining = storage.list();
    if (name === activeFile) {
      if (remaining.length === 0) {
        storage.create("Untitled 1.excalidraw");
        remaining = storage.list();
      }
      setActiveFile(remaining[0] ?? null);
    }
    setFiles(remaining);
  };

  const updateTheme = (nextTheme) => {
    if (nextTheme === "light" || nextTheme === "dark") setTheme(nextTheme);
  };

  const handleMainMenuTriggerClick = (event) => {
    const trigger =
      event.target instanceof Element
        ? event.target.closest('[data-testid="main-menu-trigger"]')
        : null;
    if (!trigger) return;

    event.preventDefault();
    event.stopPropagation();
    setExplorerOpen(true);
  };

  const handleTouchEndCapture = (event) => {
    if (event.pointerType && event.pointerType !== "touch") return;

    const target = event.target instanceof Element ? event.target : null;
    const libraryLabel = target?.closest(".sidebar-trigger__label-element");
    const libraryCheckbox = target?.closest(
      '.ToolIcon_type_checkbox[aria-label="Library"]',
    );

    // Android WebView can dispatch the touch to the label but omit the
    // checkbox click. Invoke the real Excalidraw control; desktop paths are
    // unchanged and Excalidraw keeps ownership of the sidebar state.
    if (libraryLabel || libraryCheckbox) {
      const checkbox =
        libraryCheckbox ?? libraryLabel?.querySelector('[aria-label="Library"]');
      if (checkbox instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        checkbox.click();
      }
    }
  };

  return (
    <div className={`excalidraw-container app-theme-${theme}`}>
      <main
        className="excalidraw-editor"
        onClickCapture={handleMainMenuTriggerClick}
        onTouchEndCapture={handleTouchEndCapture}
      >
        {activeFile ? (
          <DrawingEditor
            key={activeFile}
            fileName={activeFile}
            onThemeChange={updateTheme}
            onOpenExplorer={() => setExplorerOpen(true)}
            explorer={(currentApi) =>
              explorerOpen ? (
                <Explorer
                  files={files}
                  activeFile={activeFile}
                  onOpen={openDrawing}
                  onCreate={createDrawing}
                  onRename={renameDrawing}
                  onDelete={removeDrawing}
                  onClose={() => setExplorerOpen(false)}
                  api={currentApi}
                  theme={theme}
                  onThemeChange={updateTheme}
                />
              ) : null
            }
          />
        ) : (
          <div className="empty-editor">Create a drawing to get started.</div>
        )}
      </main>
    </div>
  );
}
