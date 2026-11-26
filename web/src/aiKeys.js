// API keys for AI Assist providers.
// UI-stage storage: the WebView's localStorage. Move to the Android side
// (e.g. EncryptedSharedPreferences via the JS bridge) before real use.

const storageKey = (provider) => `calidraw.ai.${provider}.apiKey`;

export const aiKeys = {
  get(provider) {
    try {
      return window.localStorage.getItem(storageKey(provider)) || null;
    } catch {
      return null;
    }
  },

  set(provider, key) {
    window.localStorage.setItem(storageKey(provider), key.trim());
  },

  remove(provider) {
    window.localStorage.removeItem(storageKey(provider));
  },
};

/** "AIzaSyD...wxyz" -> "••••••••wxyz": never show the whole key. */
export function maskKey(key) {
  if (!key) return "";
  const tail = key.length > 8 ? key.slice(-4) : "";
  return `${"•".repeat(8)}${tail}`;
}
