// Configuration de l'application — à renseigner (voir LISEZMOI.md).
// Ces valeurs ne sont pas secrètes : l'identifiant Azure est public et la clé
// Google doit être restreinte à l'adresse du site dans la console Google Cloud.
window.APP_CONFIG = {
  // Identifiant d'application (client) obtenu lors de l'inscription dans Azure / Entra ID.
  azureClientId: "A_RENSEIGNER",

  // Clé API Google (Geocoding API, Places API (New), Routes API activées).
  googleApiKey: "A_RENSEIGNER",

  // Dossier OneDrive où sont stockés parametres.json et Trajets_AAAA.csv.
  // Par défaut : le dossier réservé à l'appli (OneDrive > Applications > <nom de l'appli>).
  // Autres exemples : "/me/drive/root:/Frais kilometriques"  (dossier de votre OneDrive)
  dossierGraph: "/me/drive/special/approot",

  // Rayon (mètres) de recherche d'un lieu connu (commerce, entreprise) autour de la position.
  rayonLieuMetres: 40,

  // Précision GPS visée (mètres) et temps d'attente maximum (secondes).
  precisionGpsMetres: 50,
  delaiGpsSecondes: 15,
};
