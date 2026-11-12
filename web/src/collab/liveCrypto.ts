const IV_LENGTH_BYTES = 12;

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
  const key = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 128 }, true, ["encrypt", "decrypt"],
  );
  return (await window.crypto.subtle.exportKey("jwk", key)).k as string;
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
