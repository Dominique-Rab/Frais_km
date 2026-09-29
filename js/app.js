import * as od from "./onedrive.js";
import { positionGPS, nomDuLieu, coordonneesTexte, distanceRouteKm } from "./geo.js";
import { dicteeDisponible, ecouter } from "./voice.js";
import { sauverTrajet, tousLesTrajets, lireTrajetEnCours, ecrireTrajetEnCours } from "./storage.js";
import { ENTETE, ligneCsv, fichierDuTrajet, coutTrajet, dateFr, heureFr, nombreFr } from "./csv.js";
import {
  lireLocal, ecrireLocal, normaliser, tarifBareme, nouvelId,
  parametresAEnvoyer, parametresEnvoyes,
} from "./parametres.js";

const $ = (id) => document.getElementById(id);
const echapper = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const euros = (n) => (n == null ? "–" : nombreFr(n, 2) + " €");
const lireNombre = (v) => {
  const n = parseFloat(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
};

const CLE_CHOIX = "fraiskm.dernierChoix";
const CLE_COMMENTAIRE = "fraiskm.commentaire";

let parametres = lireLocal();
let trajet = lireTrajetEnCours();

// ---------------------------------------------------------------- Navigation

function afficherVue(nom) {
  for (const b of document.querySelectorAll("nav button")) b.classList.toggle("actif", b.dataset.vue === nom);
  for (const v of ["trajet", "historique", "parametres"]) $(`vue-${v}`).hidden = v !== nom;
  if (nom === "historique") afficherHistorique();
  if (nom === "parametres") verrouillerParametres();
}

// ---------------------------------------------------------------- Trajet

function remplirListes() {
  const choix = JSON.parse(localStorage.getItem(CLE_CHOIX) || "{}");
  const options = (valeurs, vide) =>
    `<option value="">${vide}</option>` +
    valeurs.map(([v, libelle]) => `<option value="${echapper(v)}">${echapper(libelle)}</option>`).join("");

  $("sel-conducteur").innerHTML = options(
    parametres.conducteurs.map((c) => [c, c]),
    parametres.conducteurs.length ? "— Choisir —" : "Aucun conducteur (voir Paramètres)"
  );
  $("sel-vehicule").innerHTML = options(
    parametres.vehicules.map((v) => [v.id, `${v.nom} (${v.cv} CV${v.electrique ? ", élec." : ""})`]),
    parametres.vehicules.length ? "— Choisir —" : "Aucun véhicule (voir Paramètres)"
  );
  if (parametres.conducteurs.includes(choix.conducteur)) $("sel-conducteur").value = choix.conducteur;
  if (parametres.vehicules.some((v) => v.id === choix.vehicule)) $("sel-vehicule").value = choix.vehicule;
}

function memoriserChoix() {
  localStorage.setItem(CLE_CHOIX, JSON.stringify({ conducteur: $("sel-conducteur").value, vehicule: $("sel-vehicule").value }));
}

function message(texte, type = "") {
  $("msg-trajet").textContent = texte;
  $("msg-trajet").className = `msg ${type}`;
}

function afficherTrajet() {
  const t = trajet;
  const enCours = !!t;
  $("sel-conducteur").disabled = enCours;
  $("sel-vehicule").disabled = enCours;
  if (enCours) {
    // Le trajet garde le conducteur et le véhicule choisis au départ.
    $("sel-conducteur").innerHTML = `<option>${echapper(t.conducteur)}</option>`;
    $("sel-vehicule").innerHTML = `<option>${echapper(`${t.vehicule.nom} (${t.vehicule.cv} CV)`)}</option>`;
  } else {
    remplirListes();
  }

  $("btn-demarrer").disabled = enCours;
  $("info-depart").hidden = !t?.depart;
  if (t?.depart) {
    $("heure-depart").textContent = `Départ ${heureFr(t.depart.heure)}`;
    $("lieu-depart").value = t.depart.lieu;
  }

  // Tant que le trajet n'est pas enregistré, un nouvel appui refait le relevé d'arrivée.
  $("btn-arrivee").disabled = !t?.depart;
  $("btn-arrivee").textContent = t?.arrivee ? "↻ Refaire l'arrivée" : "■ Arrivée";
  $("info-arrivee").hidden = !t?.arrivee;
  if (t?.arrivee) {
    $("heure-arrivee").textContent = `Arrivée ${heureFr(t.arrivee.heure)}`;
    $("lieu-arrivee").value = t.arrivee.lieu;
  }

  $("bloc-resultat").hidden = !t?.arrivee;
  if (t?.arrivee) {
    $("km").value = t.km == null ? "" : nombreFr(t.km, 1);
    $("cout").textContent = euros(coutTrajet(t));
  }

  $("btn-enregistrer").disabled = !t?.arrivee;
  $("btn-annuler").hidden = !enCours;
}

function enregistrerEnCours() {
  ecrireTrajetEnCours(trajet);
  afficherTrajet();
}

async function occupe(bouton, texte, action) {
  const avant = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = texte;
  try {
    await action();
  } finally {
    bouton.textContent = avant;
    afficherTrajet();
  }
}

// Position GPS + nom du lieu. Le lieu reste en coordonnées si Google ne répond pas.
async function releverPoint() {
  const pos = await positionGPS();
  const point = { ...pos, heure: new Date().toISOString(), lieu: coordonneesTexte(pos) };
  try {
    point.lieu = await nomDuLieu(pos);
  } catch (e) {
    message(`Nom du lieu indisponible (${e.message}). Vous pouvez le saisir.`, "alerte");
  }
  if (pos.ancienne) {
    message("Position GPS peut-être ancienne : vérifiez le lieu, ou appuyez à nouveau sur le bouton.", "alerte");
  } else if (pos.precision > 100) {
    message(`Position peu précise (± ${pos.precision} m).`, "alerte");
  }
  return point;
}

async function demarrer() {
  const conducteur = $("sel-conducteur").value;
  const vehicule = parametres.vehicules.find((v) => v.id === $("sel-vehicule").value);
  if (!conducteur || !vehicule) return message("Choisissez le conducteur et le véhicule.", "erreur");
  memoriserChoix();
  message("");
  await occupe($("btn-demarrer"), "Localisation…", async () => {
    try {
      const depart = await releverPoint();
      trajet = {
        id: nouvelId(),
        conducteur,
        vehicule: { nom: vehicule.nom, cv: vehicule.cv, electrique: vehicule.electrique, tarif: vehicule.tarif },
        depart,
        arrivee: null,
        km: null,
      };
      ecrireTrajetEnCours(trajet);
    } catch (e) {
      message(e.message, "erreur");
    }
  });
}

async function calculerDistance() {
  try {
    trajet.km = await distanceRouteKm(trajet.depart, trajet.arrivee);
  } catch (e) {
    message(`Distance non calculée (${e.message}). Saisissez-la ou réessayez.`, "alerte");
  }
  enregistrerEnCours();
}

async function arriver() {
  message("");
  await occupe($("btn-arrivee"), "Localisation…", async () => {
    try {
      trajet.arrivee = await releverPoint();
      trajet.km = null;
      ecrireTrajetEnCours(trajet);
      afficherTrajet();
      $("btn-arrivee").disabled = true;
      $("btn-arrivee").textContent = "Calcul de la distance…";
      await calculerDistance();
    } catch (e) {
      message(e.message, "erreur");
    }
  });
}

async function enregistrer() {
  trajet.depart.lieu = $("lieu-depart").value.trim() || coordonneesTexte(trajet.depart);
  trajet.arrivee.lieu = $("lieu-arrivee").value.trim() || coordonneesTexte(trajet.arrivee);
  trajet.km = lireNombre($("km").value);
  trajet.commentaire = $("commentaire").value.trim();
  trajet.envoye = false;
  await sauverTrajet(trajet);
  trajet = null;
  ecrireTrajetEnCours(null);
  $("commentaire").value = "";
  localStorage.removeItem(CLE_COMMENTAIRE);
  afficherTrajet();
  message("Trajet enregistré ✔", "ok");
  synchroniser();
}

function annuler() {
  if (!confirm("Annuler ce trajet ? Il ne sera pas enregistré.")) return;
  trajet = null;
  ecrireTrajetEnCours(null);
  message("");
  afficherTrajet();
}

// ---------------------------------------------------------------- Dictée

let arreterDictee = null;

function basculerDictee() {
  if (arreterDictee) return arreterDictee();
  const zone = $("commentaire");
  const debut = zone.value ? zone.value.replace(/\s*$/, " ") : "";
  $("btn-micro").classList.add("ecoute");
  arreterDictee = ecouter(
    (final, provisoire) => {
      zone.value = debut + final + provisoire;
      localStorage.setItem(CLE_COMMENTAIRE, zone.value);
    },
    (erreur) => {
      arreterDictee = null;
      $("btn-micro").classList.remove("ecoute");
      if (erreur) message(erreur, "erreur");
    }
  );
}

// ---------------------------------------------------------------- Synchronisation OneDrive

let etatSynchro = "";
let synchroEnCours = null;

async function majStatut(etat = etatSynchro) {
  etatSynchro = etat;
  const enAttente = (await tousLesTrajets()).filter((t) => !t.envoye).length;
  const b = $("btn-statut");
  const libelles = {
    "non-configure": "Local uniquement",
    deconnecte: "Se connecter",
    reconnexion: "⚠ Se reconnecter",
    envoi: "⟳ Envoi…",
    horsligne: "Hors ligne",
    erreur: "⚠ Erreur d'envoi",
    ok: "☁ OneDrive",
  };
  b.textContent = libelles[etat] + (enAttente && etat !== "envoi" ? ` · ${enAttente} en attente` : "");
  b.className = `statut ${etat}`;
}

async function synchroParametres() {
  const distant = await od.lireJson("parametres.json");
  if (!distant || (parametresAEnvoyer() && parametres.majLe >= (distant.majLe || ""))) {
    await od.ecrireJson("parametres.json", parametres);
    parametresEnvoyes();
  } else if ((distant.majLe || "") > parametres.majLe) {
    parametres = normaliser(distant);
    ecrireLocal(parametres);
    parametresEnvoyes();
    if (!trajet) afficherTrajet();
  }
}

async function envoyerTrajets() {
  const aEnvoyer = (await tousLesTrajets()).filter((t) => !t.envoye);
  for (const t of aEnvoyer.filter((t) => t.km == null)) {
    try {
      t.km = await distanceRouteKm(t.depart, t.arrivee);
      await sauverTrajet(t);
    } catch {
      // Distance toujours inconnue : le trajet est envoyé sans km, à compléter dans Excel.
    }
  }
  const parFichier = new Map();
  for (const t of aEnvoyer.reverse()) {
    const f = fichierDuTrajet(t);
    if (!parFichier.has(f)) parFichier.set(f, []);
    parFichier.get(f).push(t);
  }
  for (const [fichier, trajets] of parFichier) {
    await od.ajouterLignesCsv(fichier, ENTETE, trajets.map((t) => ({ id: t.id, texte: ligneCsv(t) })));
    for (const t of trajets) await sauverTrajet({ ...t, envoye: true, envoyeLe: new Date().toISOString() });
  }
}

function synchroniser() {
  if (synchroEnCours) return synchroEnCours;
  synchroEnCours = (async () => {
    if (!od.estConfigure()) return majStatut("non-configure");
    if (!od.compteActif()) return majStatut("deconnecte");
    if (!navigator.onLine) return majStatut("horsligne");
    await majStatut("envoi");
    try {
      await synchroParametres();
      await envoyerTrajets();
      $("msg-historique").textContent = "";
      await majStatut("ok");
    } catch (e) {
      console.error(e);
      $("msg-historique").textContent = e.message;
      $("msg-historique").className = "msg erreur";
      if (e instanceof od.ErreurConnexion) await majStatut("reconnexion");
      else await majStatut(navigator.onLine ? "erreur" : "horsligne");
    }
  })().finally(() => {
    synchroEnCours = null;
    if (!$("vue-historique").hidden) afficherHistorique();
  });
  return synchroEnCours;
}

function clicStatut() {
  if (!od.estConfigure()) return alert("Connexion OneDrive non configurée (voir LISEZMOI.md). Les trajets restent sur ce téléphone.");
  if (etatSynchro === "deconnecte" || etatSynchro === "reconnexion") return od.connecter();
  synchroniser();
}

// ---------------------------------------------------------------- Historique

async function afficherHistorique() {
  const trajets = await tousLesTrajets();
  $("liste-trajets").innerHTML = trajets.length
    ? trajets
        .slice(0, 200)
        .map(
          (t) => `<li>
        <div class="ligne1"><span>${dateFr(t.depart.heure)} ${heureFr(t.depart.heure)}–${heureFr(t.arrivee.heure)}</span>
          <span class="etat" title="${t.envoye ? "Envoyé sur OneDrive" : "En attente d'envoi"}">${t.envoye ? "✔" : "⏳"}</span></div>
        <div class="trajet">${echapper(t.depart.lieu)}<br>→ ${echapper(t.arrivee.lieu)}</div>
        <div class="ligne1"><span>${echapper(t.conducteur)} · ${echapper(t.vehicule.nom)}</span>
          <strong>${t.km == null ? "? km" : nombreFr(t.km, 1) + " km"} · ${euros(coutTrajet(t))}</strong></div>
        ${t.commentaire ? `<div class="obs">${echapper(t.commentaire)}</div>` : ""}
      </li>`
        )
        .join("")
    : `<li class="vide">Aucun trajet enregistré sur ce téléphone.</li>`;
}

async function exporterCsv() {
  const trajets = (await tousLesTrajets()).reverse();
  if (!trajets.length) return ($("msg-historique").textContent = "Aucun trajet à exporter.");
  const contenu = "﻿" + [ENTETE, ...trajets.map(ligneCsv)].join("\r\n") + "\r\n";
  const d = new Date();
  const nom = `Trajets_export_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.csv`;
  const fichier = new File([contenu], nom, { type: "text/csv" });
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      return await navigator.share({ files: [fichier], title: nom });
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(fichier);
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ---------------------------------------------------------------- Paramètres

let brouillon = null;

function verrouillerParametres() {
  $("param-verrou").hidden = false;
  $("param-contenu").hidden = true;
  $("pin").value = "";
  $("msg-pin").textContent = "";
}

function deverrouiller() {
  if ($("pin").value !== parametres.pin) {
    $("msg-pin").textContent = "Code incorrect.";
    $("msg-pin").className = "msg erreur";
    return;
  }
  brouillon = normaliser(JSON.parse(JSON.stringify(parametres)));
  $("param-verrou").hidden = true;
  $("param-contenu").hidden = false;
  $("msg-param").textContent = "";
  afficherParametres();
}

function afficherCompte() {
  const c = od.compteActif();
  if (!od.estConfigure()) {
    $("compte-info").textContent = "Non configuré : renseignez azureClientId dans js/config.js.";
    $("btn-compte").hidden = true;
    return;
  }
  $("btn-compte").hidden = false;
  $("compte-info").textContent = c ? `Connecté : ${c.username}` : "Non connecté.";
  $("btn-compte").textContent = c ? "Se déconnecter" : "Se connecter";
}

function afficherParametres() {
  afficherCompte();
  const b = brouillon;

  $("liste-conducteurs").innerHTML = b.conducteurs
    .map(
      (c, i) => `<div class="rangee">
      <input data-conducteur="${i}" value="${echapper(c)}" placeholder="Nom du conducteur">
      <button class="suppr" data-suppr-conducteur="${i}" type="button" aria-label="Supprimer">✕</button></div>`
    )
    .join("");

  $("liste-vehicules").innerHTML = b.vehicules
    .map(
      (v, i) => `<div class="carte" data-vehicule="${i}">
      <div class="rangee">
        <input data-champ="nom" value="${echapper(v.nom)}" placeholder="Nom du véhicule (ex. Clio AB-123-CD)">
        <button class="suppr" data-suppr-vehicule="${i}" type="button" aria-label="Supprimer">✕</button>
      </div>
      <div class="rangee">
        <label>Puissance
          <select data-champ="cv">${[3, 4, 5, 6, 7]
            .map((cv) => `<option value="${cv}" ${v.cv === cv ? "selected" : ""}>${cv === 7 ? "7 CV et +" : cv + " CV"}</option>`)
            .join("")}</select>
        </label>
        <label>€/km <input data-champ="tarif" inputmode="decimal" value="${nombreFr(v.tarif, 3)}"></label>
      </div>
      <label class="case"><input type="checkbox" data-champ="electrique" ${v.electrique ? "checked" : ""}> Véhicule électrique (+${b.bareme.majorationElectrique} %)</label>
    </div>`
    )
    .join("");

  $("bareme-libelle").value = b.bareme.libelle;
  $("bareme-tarifs").innerHTML = [3, 4, 5, 6, 7]
    .map((cv) => `<label>${cv === 7 ? "7 CV et +" : cv + " CV"}<input data-bareme="${cv}" inputmode="decimal" value="${nombreFr(b.bareme.tarifs[cv], 3)}"></label>`)
    .join("");
  $("bareme-elec").value = b.bareme.majorationElectrique;
  $("nouveau-pin").value = b.pin;
}

// Recopie le formulaire dans le brouillon.
function lireFormulaire() {
  const b = brouillon;
  for (const el of document.querySelectorAll("[data-conducteur]")) b.conducteurs[el.dataset.conducteur] = el.value.trim();
  for (const carte of document.querySelectorAll("[data-vehicule]")) {
    const v = b.vehicules[carte.dataset.vehicule];
    const champ = (n) => carte.querySelector(`[data-champ="${n}"]`);
    v.nom = champ("nom").value.trim();
    v.cv = Number(champ("cv").value);
    v.electrique = champ("electrique").checked;
    v.tarif = lireNombre(champ("tarif").value) ?? 0;
  }
  b.bareme.libelle = $("bareme-libelle").value.trim();
  for (const el of document.querySelectorAll("[data-bareme]")) b.bareme.tarifs[el.dataset.bareme] = lireNombre(el.value) ?? 0;
  b.bareme.majorationElectrique = lireNombre($("bareme-elec").value) ?? 0;
  b.pin = $("nouveau-pin").value.trim() || b.pin;
}

function surChangementParametres(e) {
  const el = e.target;
  lireFormulaire();
  // Puissance, type ou barème modifiés : on recalcule le €/km selon le barème.
  if (el.dataset.champ === "cv" || el.dataset.champ === "electrique") {
    const v = brouillon.vehicules[el.closest("[data-vehicule]").dataset.vehicule];
    v.tarif = tarifBareme(brouillon.bareme, v.cv, v.electrique);
    afficherParametres();
  } else if (el.dataset.bareme || el.id === "bareme-elec") {
    if (confirm("Appliquer le nouveau barème à tous les véhicules ?")) {
      for (const v of brouillon.vehicules) v.tarif = tarifBareme(brouillon.bareme, v.cv, v.electrique);
      afficherParametres();
    }
  }
}

function surClicParametres(e) {
  const el = e.target;
  if (el.dataset.supprConducteur != null) {
    lireFormulaire();
    brouillon.conducteurs.splice(el.dataset.supprConducteur, 1);
    afficherParametres();
  } else if (el.dataset.supprVehicule != null) {
    lireFormulaire();
    brouillon.vehicules.splice(el.dataset.supprVehicule, 1);
    afficherParametres();
  }
}

function sauverParametres() {
  lireFormulaire();
  brouillon.conducteurs = [...new Set(brouillon.conducteurs.filter(Boolean))];
  brouillon.vehicules = brouillon.vehicules.filter((v) => v.nom);
  brouillon.majLe = new Date().toISOString();
  parametres = normaliser(brouillon);
  ecrireLocal(parametres, { aEnvoyer: true });
  if (!trajet) afficherTrajet();
  afficherParametres();
  $("msg-param").textContent = "Paramètres enregistrés ✔";
  $("msg-param").className = "msg ok";
  synchroniser();
}

// ---------------------------------------------------------------- Démarrage

function brancher() {
  for (const b of document.querySelectorAll("nav button")) b.addEventListener("click", () => afficherVue(b.dataset.vue));
  $("btn-statut").addEventListener("click", clicStatut);

  $("btn-demarrer").addEventListener("click", demarrer);
  $("btn-arrivee").addEventListener("click", arriver);
  $("btn-enregistrer").addEventListener("click", enregistrer);
  $("btn-annuler").addEventListener("click", annuler);
  $("btn-recalculer").addEventListener("click", () => occupe($("btn-recalculer"), "Calcul…", calculerDistance));
  $("sel-conducteur").addEventListener("change", memoriserChoix);
  $("sel-vehicule").addEventListener("change", memoriserChoix);
  for (const id of ["lieu-depart", "lieu-arrivee"]) {
    $(id).addEventListener("change", () => {
      trajet[id === "lieu-depart" ? "depart" : "arrivee"].lieu = $(id).value.trim();
      ecrireTrajetEnCours(trajet);
    });
  }
  $("km").addEventListener("input", () => {
    trajet.km = lireNombre($("km").value);
    ecrireTrajetEnCours(trajet);
    $("cout").textContent = euros(coutTrajet(trajet));
  });
  $("commentaire").addEventListener("input", () => localStorage.setItem(CLE_COMMENTAIRE, $("commentaire").value));
  if (dicteeDisponible()) $("btn-micro").addEventListener("click", basculerDictee);
  else $("btn-micro").hidden = true;

  $("btn-synchro").addEventListener("click", clicStatut);
  $("btn-export").addEventListener("click", exporterCsv);

  $("btn-deverrouiller").addEventListener("click", deverrouiller);
  $("pin").addEventListener("keydown", (e) => e.key === "Enter" && deverrouiller());
  $("btn-compte").addEventListener("click", () => (od.compteActif() ? od.deconnecter() : od.connecter()));
  $("btn-ajout-conducteur").addEventListener("click", () => {
    lireFormulaire();
    brouillon.conducteurs.push("");
    afficherParametres();
    document.querySelector(`[data-conducteur="${brouillon.conducteurs.length - 1}"]`).focus();
  });
  $("btn-ajout-vehicule").addEventListener("click", () => {
    lireFormulaire();
    brouillon.vehicules.push({ id: nouvelId(), nom: "", cv: 5, electrique: false, tarif: tarifBareme(brouillon.bareme, 5, false) });
    afficherParametres();
    document.querySelector(`[data-vehicule="${brouillon.vehicules.length - 1}"] [data-champ="nom"]`).focus();
  });
  $("param-contenu").addEventListener("change", surChangementParametres);
  $("param-contenu").addEventListener("click", surClicParametres);
  $("btn-sauver-param").addEventListener("click", sauverParametres);

  window.addEventListener("online", synchroniser);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && synchroniser());
}

async function demarrerAppli() {
  brancher();
  $("commentaire").value = localStorage.getItem(CLE_COMMENTAIRE) || "";
  afficherTrajet();
  if (!parametres.conducteurs.length || !parametres.vehicules.length) {
    message("Commencez par renseigner les conducteurs et les véhicules dans Paramètres (code initial : 0000).", "alerte");
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(console.error);
  try {
    await od.initAuth();
  } catch (e) {
    console.error(e);
  }
  await synchroniser();
}

demarrerAppli();
