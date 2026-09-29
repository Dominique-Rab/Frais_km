// Format des lignes CSV (séparateur « ; », virgule décimale : Excel en français).

export const ENTETE = [
  "Date",
  "Heure départ",
  "Heure arrivée",
  "Conducteur",
  "Véhicule",
  "Puissance (CV)",
  "Lieu départ",
  "Lieu arrivée",
  "Km",
  "€/km",
  "Coût (€)",
  "Commentaire",
  "GPS départ",
  "GPS arrivée",
  "ID",
].join(";");

const deux = (n) => String(n).padStart(2, "0");
export const dateFr = (iso) => {
  const d = new Date(iso);
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
};
export const heureFr = (iso) => {
  const d = new Date(iso);
  return `${deux(d.getHours())}:${deux(d.getMinutes())}`;
};
export const nombreFr = (n, decimales) => (n == null ? "" : n.toFixed(decimales).replace(".", ","));

const champ = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
const gps = (p) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;

export const coutTrajet = (t) => (t.km == null ? null : Math.round(t.km * t.vehicule.tarif * 100) / 100);

export function ligneCsv(t) {
  return [
    dateFr(t.depart.heure),
    heureFr(t.depart.heure),
    heureFr(t.arrivee.heure),
    champ(t.conducteur),
    champ(t.vehicule.nom),
    t.vehicule.cv,
    champ(t.depart.lieu),
    champ(t.arrivee.lieu),
    nombreFr(t.km, 1),
    nombreFr(t.vehicule.tarif, 3),
    nombreFr(coutTrajet(t), 2),
    champ(t.commentaire),
    champ(gps(t.depart)),
    champ(gps(t.arrivee)),
    t.id,
  ].join(";");
}

export const fichierDuTrajet = (t) => `Trajets_${new Date(t.depart.heure).getFullYear()}.csv`;
