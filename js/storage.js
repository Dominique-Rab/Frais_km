// Trajets enregistrés sur le téléphone (IndexedDB). Chaque trajet y reste,
// avec envoye = true une fois ajouté au CSV sur OneDrive.

const NOM_BASE = "fraiskm";
const TABLE = "trajets";

let base = null;

function ouvrir() {
  if (base) return Promise.resolve(base);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOM_BASE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(TABLE, { keyPath: "id" });
    req.onsuccess = () => resolve((base = req.result));
    req.onerror = () => reject(req.error);
  });
}

async function operation(mode, action) {
  const db = await ouvrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TABLE, mode);
    const req = action(tx.objectStore(TABLE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const sauverTrajet = (trajet) => operation("readwrite", (t) => t.put(trajet));

export async function tousLesTrajets() {
  const liste = (await operation("readonly", (t) => t.getAll())) || [];
  return liste.sort((a, b) => b.depart.heure.localeCompare(a.depart.heure));
}

// Trajet en cours (entre « Démarrer » et « Enregistrer »), conservé si l'appli est fermée.
const CLE_EN_COURS = "fraiskm.trajetEnCours";

export function lireTrajetEnCours() {
  try {
    return JSON.parse(localStorage.getItem(CLE_EN_COURS));
  } catch {
    return null;
  }
}

export function ecrireTrajetEnCours(trajet) {
  if (trajet) localStorage.setItem(CLE_EN_COURS, JSON.stringify(trajet));
  else localStorage.removeItem(CLE_EN_COURS);
}
