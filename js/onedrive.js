// Connexion Microsoft (MSAL) et lecture / écriture des fichiers sur OneDrive
// via Microsoft Graph.

const cfg = window.APP_CONFIG;
const GRAPH = "https://graph.microsoft.com/v1.0";
const BOM = "﻿";
const SCOPES =
  cfg.dossierGraph === "/me/drive/special/approot" ? ["Files.ReadWrite.AppFolder"] : ["Files.ReadWrite.All"];

let app = null;
let compte = null;

// Levée quand une (re)connexion Microsoft est nécessaire.
export class ErreurConnexion extends Error {
  constructor() {
    super("Connexion Microsoft nécessaire.");
  }
}

export const estConfigure = () => !!cfg.azureClientId && !cfg.azureClientId.startsWith("A_RENSEIGNER");
export const compteActif = () => compte;

export async function initAuth() {
  if (!estConfigure() || !window.msal) return null;
  app = new msal.PublicClientApplication({
    auth: {
      clientId: cfg.azureClientId,
      authority: "https://login.microsoftonline.com/consumers",
      redirectUri: new URL("./", location.href).href,
    },
    cache: { cacheLocation: "localStorage" },
  });
  await app.initialize();
  const retour = await app.handleRedirectPromise();
  compte = retour?.account || app.getAllAccounts()[0] || null;
  if (compte) {
    app.setActiveAccount(compte);
    try {
      localStorage.setItem(CLE_DERNIER_COMPTE, compte.username);
    } catch {}
  }
  return compte;
}

const CLE_DERNIER_COMPTE = "fraiskm.dernierCompte";

// Redirection vers la page de connexion Microsoft (plus fiable qu'une fenêtre
// popup dans une appli installée sur iPhone). Le compte est pré-rempli et les
// comptes professionnels (Deapak) écartés : pas d'écran « Choisir un compte ».
export function connecter() {
  let indice = cfg.compteMicrosoft || "";
  try {
    indice = localStorage.getItem(CLE_DERNIER_COMPTE) || indice;
  } catch {}
  return app.loginRedirect({ scopes: SCOPES, loginHint: indice || undefined, domainHint: "consumers" });
}

export function deconnecter() {
  return app.logoutRedirect({ account: compte, postLogoutRedirectUri: new URL("./", location.href).href });
}

async function jeton() {
  if (!app || !compte) throw new ErreurConnexion();
  try {
    return (await app.acquireTokenSilent({ scopes: SCOPES, account: compte })).accessToken;
  } catch (e) {
    if (e instanceof msal.InteractionRequiredAuthError) throw new ErreurConnexion();
    throw e;
  }
}

function cheminFichier(nom) {
  const d = cfg.dossierGraph.replace(/\/$/, "");
  // Chemin déjà adressé par nom (".../root:/Dossier") ou dossier adressé par id.
  return d.includes(":") ? `${d}/${nom}:` : `${d}:/${nom}:`;
}

async function graph(chemin, options = {}) {
  const t = await jeton();
  const r = await fetch(GRAPH + encodeURI(chemin), {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${t}` },
  });
  if (r.status === 401) throw new ErreurConnexion();
  return r;
}

// Renvoie { texte, eTag } ou null si le fichier n'existe pas.
async function lireFichier(nom) {
  const r = await graph(cheminFichier(nom));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`OneDrive : lecture de ${nom} impossible (${r.status}).`);
  const meta = await r.json();
  const contenu = await fetch(meta["@microsoft.graph.downloadUrl"], { cache: "no-store" });
  if (!contenu.ok) throw new Error(`OneDrive : téléchargement de ${nom} impossible (${contenu.status}).`);
  return { texte: await contenu.text(), eTag: meta.eTag };
}

function ecrireFichier(nom, contenu, type, { eTag = null, creation = false } = {}) {
  const headers = { "Content-Type": type };
  if (eTag) headers["If-Match"] = eTag;
  const params = creation ? "?@microsoft.graph.conflictBehavior=fail" : "";
  return graph(cheminFichier(nom) + "/content" + params, { method: "PUT", headers, body: contenu });
}

export async function lireJson(nom) {
  const f = await lireFichier(nom);
  return f ? JSON.parse(f.texte.replace(/^﻿/, "")) : null;
}

export async function ecrireJson(nom, objet) {
  const r = await ecrireFichier(nom, JSON.stringify(objet, null, 2), "application/json");
  if (!r.ok) throw new Error(`OneDrive : enregistrement de ${nom} impossible (${r.status}).`);
}

// Ajoute des lignes à un CSV (créé avec son en-tête s'il n'existe pas).
// lignes : [{ id, texte }] — une ligne dont l'id figure déjà dans le fichier
// n'est pas ajoutée une seconde fois. Si un autre téléphone a modifié le
// fichier entre la lecture et l'écriture, on recommence.
export async function ajouterLignesCsv(nom, entete, lignes) {
  for (let essai = 1; essai <= 5; essai++) {
    const f = await lireFichier(nom);
    let texte = f ? f.texte.replace(/^﻿/, "") : entete + "\r\n";
    if (texte && !texte.endsWith("\n")) texte += "\r\n";
    const nouvelles = lignes.filter((l) => !texte.includes(l.id));
    if (!nouvelles.length) return;
    texte += nouvelles.map((l) => l.texte + "\r\n").join("");

    const r = await ecrireFichier(nom, BOM + texte, "text/csv; charset=utf-8", f ? { eTag: f.eTag } : { creation: true });
    if (r.ok) return;
    if (r.status !== 409 && r.status !== 412) throw new Error(`OneDrive : écriture de ${nom} impossible (${r.status}).`);
    await new Promise((ok) => setTimeout(ok, 400 * essai + Math.random() * 400));
  }
  throw new Error(`OneDrive : ${nom} est modifié en permanence, nouvel essai plus tard.`);
}
