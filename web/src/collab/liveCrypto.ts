const IV_LENGTH_BYTES = 12;

const getCryptoKey = (key: string, usage: KeyUsage) =>
  window.crypto.subtle.importKey(
    "jwk",
    { alg: "A128GCM", ext: true, k: key, key_ops: ["encrypt", "decrypt"], kty: "oct" },
    { name: "AES-GCM", length: 128 },
    false,
    [usage],
  );

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

export const decryptLiveData = (iv: Uint8Array, encrypted: ArrayBuffer, key: string) =>
  window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, getCryptoKey(key, "decrypt"), encrypted);
