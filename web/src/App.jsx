import { useMemo, useRef, useEffect } from "react";
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./App.css";

const native = window.Android;

function loadInitialData() {
  try {
    const raw = native?.loadScene();
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      elements: data.elements,
      appState: { ...data.appState, collaborators: [] },
      files: data.files,
    };
  } catch (e) {
    console.error("load failed", e);
    return null;
  }
}

function App() {
  const initialData = useMemo(() => loadInitialData(), []);
  const timer = useRef(null);
  const latest = useRef(null);

  const flush = () => {
    if (!latest.current || !native) return;
    const { elements, appState, files } = latest.current;
    native.saveScene(serializeAsJSON(elements, appState, files, "local"));
    latest.current = null;
  };

  const handleChange = (elements, appState, files) => {
    latest.current = { elements, appState, files };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  };

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        clearTimeout(timer.current);
        flush();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  return (
    <div className="excalidraw-container">
      <Excalidraw initialData={initialData} onChange={handleChange} />
    </div>
  );
}

export default App;