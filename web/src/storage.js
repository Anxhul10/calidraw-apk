const native = window.Android;
const P = "calidraw:";

const browser = {
  list: () => Object.keys(localStorage).filter(k => k.startsWith(P)).map(k => k.slice(P.length)).sort(),
  create: (n) => (localStorage.getItem(P + n) !== null ? false : (localStorage.setItem(P + n, ""), true)),
  read: (n) => localStorage.getItem(P + n) ?? "",
  write: (n, j) => localStorage.setItem(P + n, j),
  rename: (a, b) => {
    if (localStorage.getItem(P + b) !== null) return false;
    localStorage.setItem(P + b, localStorage.getItem(P + a) ?? "");
    localStorage.removeItem(P + a);
    return true;
  },
  remove: (n) => (localStorage.removeItem(P + n), true),
};

export const storage = native
  ? {
      list: () => JSON.parse(native.listFiles()),
      create: (n) => native.createFile(n),
      read: (n) => native.readFile(n),
      write: (n, j) => native.writeFile(n, j),
      rename: (a, b) => native.renameFile(a, b),
      remove: (n) => native.deleteFile(n),
    }
  : browser;

export const workspaceName = native ? native.getWorkspaceName() : "Browser";