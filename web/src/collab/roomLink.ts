import {
  generateLiveEncryptionKey,
  serializeCryptoError,
} from "./liveCrypto";

const bytesToHexString = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const ROOM_HASH = /^#room=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/;
const PUBLIC_APP_URL =
  import.meta.env.VITE_APP_PUBLIC_URL || "https://calidraw-apk-web.vercel.app";
export const getRoomLinkData = (link: string) => {
  const url = new URL(link);
  const match = url.hash.match(ROOM_HASH);
  console.info("Calidraw collaboration link parse", {
    origin: url.origin,
    pathname: url.pathname,
    hasRoomHash: url.hash.startsWith("#room="),
    roomId: match?.[1] ?? null,
    encryptionKeyLength: match?.[2]?.length ?? 0,
  });
  return match ? { roomId: match[1], roomKey: match[2] } : null;
};
export const generateRoomLinkData = async () => {
  try {
    console.log("isSecureContext:", window.isSecureContext);
    console.log("crypto available:", !!window.crypto);
    console.log("subtle available:", !!window.crypto?.subtle);
    console.log("origin:", window.location.origin);
    const roomId = bytesToHexString(
      window.crypto.getRandomValues(new Uint8Array(10)),
    );
    const roomKey = await generateLiveEncryptionKey();
    if (!roomKey) throw new Error("Couldn't generate room key");
    return { roomId, roomKey };
  } catch (error) {
    console.error("Calidraw collaboration room generation failed", {
      ...serializeCryptoError(error),
      isSecureContext: window.isSecureContext,
      hasCrypto: Boolean(window.crypto),
      hasSubtle: Boolean(window.crypto?.subtle),
      hasGetRandomValues: typeof window.crypto?.getRandomValues === "function",
    });
    throw error;
  }
};
export const getRoomLink = (room: { roomId: string; roomKey: string }) => {
  const publicUrl = new URL(PUBLIC_APP_URL);
  publicUrl.hash = `room=${room.roomId},${room.roomKey}`;
  const link = publicUrl.href;
  console.info("Calidraw collaboration link generated", {
    publicUrl: `${publicUrl.origin}${publicUrl.pathname}`,
    roomId: room.roomId,
    hasRoomHash: link.includes("#room="),
    encryptionKeyLength: room.roomKey.length,
  });
  return link;
};
