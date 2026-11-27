// Minimal Gemini client for AI Assist: the REST generateContent endpoint,
// called straight from the page with the user's own API key.
// Docs: https://ai.google.dev/gemini-api/docs/generate-content

import {
  convertToExcalidrawElements,
  exportToBlob,
} from "@excalidraw/excalidraw";

/** Stable Flash model: quick and cheap, and it reads images. Change here. */
export const GEMINI_MODEL = "gemini-3.6-flash";

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_INSTRUCTION = [
  "You are AI Assist inside Calidraw, a hand-drawn diagram app built on Excalidraw.",
  "When the user attaches shapes from their canvas, you get a PNG image of them",
  "and a JSON list of the elements (type, position, size, text, colours and arrow",
  "connections). Use both to analyze, explain and suggest improvements to the drawing.",
  "Answer in plain text without Markdown formatting, and keep replies short: they",
  "are shown in a small chat panel on a phone.",
].join(" ");

// "Improve it": Gemini answers with JSON (structured output) describing the
// improved diagram as a flat list, which we turn into Excalidraw elements.
const IMPROVE_INSTRUCTION = [
  "Improve the attached diagram: fix layout and alignment, make spacing even,",
  "make labels clear, connect related shapes with arrows, and fill obvious gaps,",
  "while keeping the user's meaning. Return the complete improved diagram, not a",
  "diff. Use the same coordinate space as the input JSON (x/y are the top-left",
  'corner, in pixels). Put text inside shapes with `label`; use type "text" only',
  "for free-standing text. Connect arrows with startId/endId (ids of shapes in",
  "your output). Keep shapes at least 120x60 so labels fit. Colours are optional",
  "hex values. In `explanation`, say briefly in plain text what you changed.",
].join(" ");

const IMPROVE_SCHEMA = {
  type: "OBJECT",
  properties: {
    explanation: { type: "STRING" },
    elements: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          type: {
            type: "STRING",
            enum: ["rectangle", "ellipse", "diamond", "text", "arrow"],
          },
          x: { type: "NUMBER" },
          y: { type: "NUMBER" },
          width: { type: "NUMBER" },
          height: { type: "NUMBER" },
          label: {
            type: "STRING",
            description: "Text inside a shape or on an arrow",
          },
          text: { type: "STRING", description: "Only for type text" },
          startId: {
            type: "STRING",
            description: "Arrows: id of the shape it starts at",
          },
          endId: {
            type: "STRING",
            description: "Arrows: id of the shape it points to",
          },
          strokeColor: { type: "STRING" },
          backgroundColor: { type: "STRING" },
        },
        required: ["id", "type", "x", "y"],
      },
    },
  },
  required: ["explanation", "elements"],
};

const COLOR = /^(#[0-9a-f]{3,8}|transparent)$/i;

/** Gemini's flat element list -> Excalidraw element skeletons. */
function toSkeleton(items) {
  const shapeIds = new Set(
    items
      .filter((i) => i.type !== "arrow" && i.type !== "text")
      .map((i) => i.id),
  );
  const skeleton = [];
  for (const item of items) {
    const base = {
      id: item.id,
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
    };
    if (COLOR.test(item.strokeColor ?? "")) base.strokeColor = item.strokeColor;
    if (COLOR.test(item.backgroundColor ?? "")) {
      base.backgroundColor = item.backgroundColor;
      base.fillStyle = "solid";
    }

    if (item.type === "text") {
      const text = item.text || item.label;
      if (text) skeleton.push({ ...base, type: "text", text });
    } else if (item.type === "arrow") {
      const arrow = {
        ...base,
        type: "arrow",
        width: Number(item.width) || 100,
        height: Number(item.height) || 0,
      };
      if (shapeIds.has(item.startId)) arrow.start = { id: item.startId };
      if (shapeIds.has(item.endId)) arrow.end = { id: item.endId };
      if (item.label) arrow.label = { text: item.label };
      skeleton.push(arrow);
    } else if (["rectangle", "ellipse", "diamond"].includes(item.type)) {
      const shape = {
        ...base,
        type: item.type,
        width: Math.max(Number(item.width) || 160, 40),
        height: Math.max(Number(item.height) || 80, 40),
      };
      if (item.label) shape.label = { text: item.label };
      skeleton.push(shape);
    }
  }
  return skeleton;
}

/**
 * Turn a selection into what Gemini gets: a PNG (white background, so it reads
 * well whatever the app theme) and a compact JSON description of the elements.
 */
export async function prepareAttachment({ elements, files }) {
  const blob = await exportToBlob({
    elements,
    files,
    mimeType: "image/png",
    exportPadding: 16,
    maxWidthOrHeight: 768, // plenty to read a diagram; smaller = faster upload
    appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
  });
  return {
    imageBase64: await blobToBase64(blob),
    elementsJson: JSON.stringify(elements.map(describeElement)),
  };
}

function describeElement(el) {
  const round = (n) => Math.round(n);
  const out = {
    id: el.id,
    type: el.type,
    x: round(el.x),
    y: round(el.y),
    width: round(el.width),
    height: round(el.height),
  };
  if (el.text) out.text = el.text;
  if (el.containerId) out.insideShape = el.containerId;
  if (el.strokeColor) out.strokeColor = el.strokeColor;
  if (el.backgroundColor && el.backgroundColor !== "transparent") {
    out.backgroundColor = el.backgroundColor;
  }
  if (el.startBinding?.elementId) out.from = el.startBinding.elementId;
  if (el.endBinding?.elementId) out.to = el.endBinding.elementId;
  return out;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Chat messages (as kept by the panel) -> Gemini `contents`. Failed replies
 * are left out, and neighbouring turns from the same side are merged so the
 * conversation always alternates user / model.
 */
function toContents(messages) {
  const turns = messages
    .filter((m) => m.role === "user" || m.status === "done")
    .map((m) => {
      const parts = [];
      if (m.attachment?.gemini) {
        parts.push({
          inlineData: {
            mimeType: "image/png",
            data: m.attachment.gemini.imageBase64,
          },
        });
        parts.push({
          text: `Selected elements (JSON): ${m.attachment.gemini.elementsJson}`,
        });
      }
      if (m.text) parts.push({ text: m.text });
      if (parts.length === 0) parts.push({ text: "(attachment)" });
      return { role: m.role === "user" ? "user" : "model", parts };
    });

  const merged = [];
  for (const turn of turns) {
    const last = merged.at(-1);
    if (last?.role === turn.role) last.parts.push(...turn.parts);
    else merged.push(turn);
  }
  return merged;
}

export class GeminiError extends Error {}

// Gemini 3 Flash thinks at "medium" by default, which can take tens of seconds.
// Google recommends "low" for fast chat. (If the endpoint ever rejects this
// field, askGemini retries once without it.)
const THINKING_CONFIG = { thinkingLevel: "low" };

/** How long to wait before giving up. */
const TIMEOUT_MS = { chat: 60_000, improve: 90_000 };

async function post(apiKey, body, signal) {
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new GeminiError(
      "Couldn't reach Gemini. Check your internet connection and try again.",
    );
  }
  const data = await response.json().catch((error) => {
    if (error.name === "AbortError") throw error;
    return null;
  });
  return { response, data };
}

/**
 * Send the whole conversation. Returns { text }, and for mode "improve" also
 * { proposal: { skeleton, preview } } with the improved diagram.
 * Pass `signal` to let the user cancel; a timeout applies either way.
 */
export async function askGemini({ apiKey, messages, mode = "chat", signal }) {
  const contents = toContents(messages);
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents,
    generationConfig: { thinkingConfig: THINKING_CONFIG },
  };
  if (mode === "improve") {
    contents.at(-1)?.parts.push({ text: IMPROVE_INSTRUCTION });
    body.generationConfig.responseMimeType = "application/json";
    body.generationConfig.responseSchema = IMPROVE_SCHEMA;
  }

  const timeoutMs = TIMEOUT_MS[mode] ?? TIMEOUT_MS.chat;
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel);

  const started = performance.now();
  const requestKb = Math.round(JSON.stringify(body).length / 1024);
  console.log(`[AI Assist] asking ${GEMINI_MODEL} (${mode}, ${requestKb} KB)`);

  try {
    let { response, data } = await post(apiKey, body, controller.signal);

    if (
      response.status === 400 &&
      /thinking/i.test(data?.error?.message ?? "")
    ) {
      console.warn(
        "[AI Assist] thinkingLevel not accepted; retrying without it",
      );
      delete body.generationConfig.thinkingConfig;
      ({ response, data } = await post(apiKey, body, controller.signal));
    }

    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const usage = data?.usageMetadata;
    console.log(
      `[AI Assist] ${GEMINI_MODEL} answered in ${seconds}s` +
        (usage
          ? ` (input ${usage.promptTokenCount ?? "?"}, thinking ${usage.thoughtsTokenCount ?? 0}, output ${usage.candidatesTokenCount ?? "?"} tokens)`
          : ""),
    );

    return readReply(response, data, mode);
  } catch (error) {
    if (error.name === "AbortError") {
      if (timedOut) {
        console.error(`[AI Assist] no answer after ${timeoutMs / 1000}s`);
        throw new GeminiError(
          `Gemini didn't answer within ${timeoutMs / 1000} seconds. Try again, or select fewer shapes.`,
        );
      }
      throw error; // cancelled by the user
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

function readReply(response, data, mode) {
  if (!response.ok) {
    const detail = data?.error?.message ?? `HTTP ${response.status}`;
    console.error("[AI Assist] Gemini error", response.status, detail);
    if (
      /api key/i.test(detail) ||
      response.status === 401 ||
      response.status === 403
    ) {
      throw new GeminiError(
        "Gemini rejected the API key. Check it with the key button above.",
      );
    }
    if (response.status === 429) {
      throw new GeminiError(
        "Gemini's rate limit or quota was reached. Wait a moment and try again.",
      );
    }
    throw new GeminiError(`Gemini returned an error: ${detail}`);
  }

  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => part.text && !part.thought)
    .map((part) => part.text)
    .join("")
    .trim();

  if (!text) {
    const reason =
      data?.promptFeedback?.blockReason ?? candidate?.finishReason ?? "no text";
    throw new GeminiError(`Gemini sent no answer (${reason}).`);
  }

  if (mode !== "improve") return { text };

  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new GeminiError(
      "Gemini's improved diagram couldn't be read. Try again.",
    );
  }
  const skeleton = toSkeleton(
    Array.isArray(result?.elements) ? result.elements : [],
  );
  if (skeleton.length === 0) {
    throw new GeminiError(
      "Gemini didn't return an improved diagram. Try again.",
    );
  }
  return {
    text: String(result.explanation || "Here's an improved version."),
    proposal: {
      skeleton,
      // Fresh elements just for the preview thumbnail; applying converts again.
      preview: convertToExcalidrawElements(skeleton),
    },
  };
}
