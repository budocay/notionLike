// Node 26 expose un `localStorage` global dont le premier accès, lancé sans `--localstorage-file`,
// écrit un avertissement expérimental sur la sortie d'erreur. `lib0`, que chargent Yjs, Hocuspocus et
// y-protocols, le lit à son chargement. Le serveur n'a aucun stockage local : ce module, importé en
// premier par chaque module qui les charge, le remplace par `undefined` sans le lire, pour que la
// sortie d'erreur du processus reste vide (F-008-AC11) ; `lib0` prend alors son stockage en mémoire.
Object.defineProperty(globalThis, "localStorage", {
  value: undefined,
  configurable: true,
  writable: true,
});

export {};
