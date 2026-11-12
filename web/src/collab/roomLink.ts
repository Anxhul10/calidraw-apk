import { generateLiveEncryptionKey } from "./liveCrypto";

const bytesToHexString = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const ROOM_HASH = /^#room=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/;
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
  const roomId = bytesToHexString(window.crypto.getRandomValues(new Uint8Array(10)));
  const roomKey = await generateLiveEncryptionKey();
  if (!roomKey) throw new Error("Couldn't generate room key");
  return { roomId, roomKey };
};
export const getRoomLink = (room: { roomId: string; roomKey: string }) => {
  const link =
    `${window.location.origin}${window.location.pathname}#room=${room.roomId},${room.roomKey}`;
  console.info("Calidraw collaboration link generated", {
    origin: window.location.origin,
    pathname: window.location.pathname,
    roomId: room.roomId,
    hasRoomHash: link.includes("#room="),
    encryptionKeyLength: room.roomKey.length,
  });
  return link;
};
