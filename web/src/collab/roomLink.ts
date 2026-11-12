import { generateLiveEncryptionKey } from "./liveCrypto";

const bytesToHexString = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const ROOM_HASH = /^#room=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/;
export const getRoomLinkData = (link: string) => {
  const match = new URL(link).hash.match(ROOM_HASH);
  return match ? { roomId: match[1], roomKey: match[2] } : null;
};
export const generateRoomLinkData = async () => {
  const roomId = bytesToHexString(window.crypto.getRandomValues(new Uint8Array(10)));
  const roomKey = await generateLiveEncryptionKey();
  if (!roomKey) throw new Error("Couldn't generate room key");
  return { roomId, roomKey };
};
export const getRoomLink = (room: { roomId: string; roomKey: string }) =>
  `${window.location.origin}${window.location.pathname}#room=${room.roomId},${room.roomKey}`;
