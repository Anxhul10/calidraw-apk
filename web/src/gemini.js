// Minimal Gemini client for AI Assist: the REST generateContent endpoint,
// called straight from the page with the user's own API key.
// Docs: https://ai.google.dev/gemini-api/docs/generate-content

import { exportToBlob } from "@excalidraw/excalidraw";

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
    maxWidthOrHeight: 1024,
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

/** Send the whole conversation, return Gemini's reply text. */
export async function askGemini({ apiKey, messages, signal }) {
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: toContents(messages),
      }),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new GeminiError(
      "Couldn't reach Gemini. Check your internet connection and try again.",
    );
  }

  const data = await response.json().catch(() => null);

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
  return text;
}
