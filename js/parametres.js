// Paramètres : conducteurs, véhicules, barème. Copie locale (localStorage),
// synchronisée avec parametres.json sur OneDrive.

const CLE = "fraiskm.parametres";
const CLE_A_ENVOYER = "fraiskm.parametresAEnvoyer";

// Barème kilométrique fiscal, voitures, tranche « jusqu'à 5 000 km » (€/km).
// Barème 2025 (revenus 2024), identique au barème 2024. À mettre à jour dans le
// paramétrage lors de la publication d'un nouveau barème.
export const BAREME_DEFAUT = {
  libelle: "Barème 2025 (revenus 2024) – jusqu'à 5 000 km",
  tarifs: { 3: 0.529, 4: 0.606, 5: 0.636, 6: 0.665, 7: 0.697 },
  majorationElectrique: 20, // en %
};

export function parametresParDefaut() {
  return {
    pin: "0000",
    conducteurs: [],
    vehicules: [], // { id, nom, cv, electrique, tarif }
    bareme: JSON.parse(JSON.stringify(BAREME_DEFAUT)),
    majLe: "",
  };
}

export function normaliser(p) {
  const d = parametresParDefaut();
  return {
    pin: String(p?.pin ?? d.pin),
    conducteurs: Array.isArray(p?.conducteurs) ? p.conducteurs.filter(Boolean).map(String) : [],
    vehicules: Array.isArray(p?.vehicules)
      ? p.vehicules.map((v) => ({
          id: String(v.id || nouvelId()),
          nom: String(v.nom || ""),
          cv: Number(v.cv) || 5,
          electrique: !!v.electrique,
          tarif: Number(v.tarif) || 0,
        }))
      : [],
    bareme: {
      libelle: p?.bareme?.libelle ?? d.bareme.libelle,
      tarifs: { ...d.bareme.tarifs, ...(p?.bareme?.tarifs || {}) },
      majorationElectrique: Number(p?.bareme?.majorationElectrique ?? d.bareme.majorationElectrique),
    },
    majLe: String(p?.majLe || ""),
  };
}

export function lireLocal() {
  try {
    const brut = localStorage.getItem(CLE);
    return brut ? normaliser(JSON.parse(brut)) : parametresParDefaut();
  } catch {
    return parametresParDefaut();
  }
}

export function ecrireLocal(p, { aEnvoyer = false } = {}) {
  localStorage.setItem(CLE, JSON.stringify(p));
  if (aEnvoyer) localStorage.setItem(CLE_A_ENVOYER, "1");
}

export const parametresAEnvoyer = () => localStorage.getItem(CLE_A_ENVOYER) === "1";
export const parametresEnvoyes = () => localStorage.removeItem(CLE_A_ENVOYER);

// Tarif €/km du barème pour une puissance fiscale (7 = « 7 CV et plus »).
export function tarifBareme(bareme, cv, electrique) {
  const cle = Math.min(Math.max(Math.round(Number(cv) || 3), 3), 7);
  const base = Number(bareme.tarifs[cle]) || 0;
  const coef = electrique ? 1 + (Number(bareme.majorationElectrique) || 0) / 100 : 1;
  return Math.round(base * coef * 1000) / 1000;
}

export function nouvelId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
