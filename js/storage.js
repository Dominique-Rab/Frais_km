// Trajets enregistrés sur le téléphone (IndexedDB). Chaque trajet y reste,
// avec envoye = true une fois ajouté au CSV sur OneDrive.

const NOM_BASE = "fraiskm";
const TABLE = "trajets";

// Après un long passage en arrière-plan, iOS coupe la connexion à la base
// (« Connection to Indexed Database server lost ») sans prévenir : toute
// transaction échoue ensuite. On rouvre donc la base et on réessaie une fois,
// avec un délai maximum pour ne jamais rester bloqué.
let base = null;

function ouvrir() {
  if (base) return Promise.resolve(base);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOM_BASE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(TABLE, { keyPath: "id" });
    req.onsuccess = () => {
      base = req.result;
      base.onclose = () => (base = null);
      base.onversionchange = () => {
        base.close();
        base = null;
      };
      resolve(base);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Base de données bloquée."));
  });
}

function transaction(db, mode, action) {
  return new Promise((resolve, reject) => {
    const minuteur = setTimeout(() => reject(new Error("Base de données : pas de réponse.")), 5000);
    const fin = (f) => (v) => {
      clearTimeout(minuteur);
      f(v);
    };
    try {
      const tx = db.transaction(TABLE, mode);
      const req = action(tx.objectStore(TABLE));
      tx.oncomplete = fin(() => resolve(req?.result));
      tx.onerror = fin(() => reject(tx.error || new Error("Erreur de la base de données.")));
      tx.onabort = fin(() => reject(tx.error || new Error("Opération annulée par la base de données.")));
    } catch (e) {
      fin(reject)(e);
    }
  });
}

async function operation(mode, action) {
  try {
    return await transaction(await ouvrir(), mode, action);
  } catch (e) {
    console.warn("Base de données : reconnexion", e);
    try {
      base?.close();
    } catch {}
    base = null;
    return transaction(await ouvrir(), mode, action);
  }
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
