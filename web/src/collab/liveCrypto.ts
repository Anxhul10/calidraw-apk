const IV_LENGTH_BYTES = 12;

export const serializeCryptoError = (error: unknown) => {
  const value = error as { name?: unknown; message?: unknown; stack?: unknown };
  return {
    name: typeof value?.name === "string" ? value.name : undefined,
    message:
      typeof value?.message === "string" ? value.message : String(error),
    stack: typeof value?.stack === "string" ? value.stack : undefined,
  };
};

const getCryptoDiagnostics = () => ({
  isSecureContext: window.isSecureContext,
  hasCrypto: Boolean(window.crypto),
  hasSubtle: Boolean(window.crypto?.subtle),
  hasGetRandomValues: typeof window.crypto?.getRandomValues === "function",
});

const getCryptoKey = async (key: string, usage: KeyUsage) => {
  const isCryptoKey =
    typeof CryptoKey !== "undefined" && key instanceof CryptoKey;
  console.info("Calidraw collaboration crypto key input", {
    typeofKey: typeof key,
    isCryptoKey,
    keyInitializationCompleted: false,
  });

  const cryptoKey = await window.crypto.subtle.importKey(
    "jwk",
    { alg: "A128GCM", ext: true, k: key, key_ops: ["encrypt", "decrypt"], kty: "oct" },
    { name: "AES-GCM", length: 128 },
    false,
    [usage],
  );

  console.info("Calidraw collaboration crypto key initialized", {
    keyInitializationCompleted: true,
    algorithm: cryptoKey.algorithm?.name,
    algorithmLength: cryptoKey.algorithm?.length,
    usages: cryptoKey.usages,
  });
  return cryptoKey;
};

export const generateLiveEncryptionKey = async () => {
  try {
    // Preserve the 128-bit AES JWK `k` format while avoiding WebView-specific
    // failures in SubtleCrypto.generateKey/exportKey.
    const keyBytes = window.crypto.getRandomValues(new Uint8Array(16));
    const binary = String.fromCharCode(...keyBytes);
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  } catch (error) {
    console.error("Calidraw collaboration key generation failed", {
      ...serializeCryptoError(error),
      ...getCryptoDiagnostics(),
    });
    throw error;
  }
};

export const encryptLiveData = async (key: string, data: Uint8Array) => {
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, await getCryptoKey(key, "encrypt"), data,
  );
  return { encryptedBuffer, iv };
};

export const decryptLiveData = async (
  iv: Uint8Array,
  encrypted: ArrayBuffer,
  key: string,
) => {
  console.info("Calidraw collaboration decrypt input", {
    typeofKey: typeof key,
    isCryptoKey:
      typeof CryptoKey !== "undefined" && key instanceof CryptoKey,
    ivByteLength: iv.byteLength,
    expectedIvByteLength: IV_LENGTH_BYTES,
  });
  const importedKey = await getCryptoKey(key, "decrypt");
  return window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    importedKey,
    encrypted,
  );
};
