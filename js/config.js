// Configuration de l'application — à renseigner (voir LISEZMOI.md).
// Ces valeurs ne sont pas secrètes : l'identifiant Azure est public et la clé
// Google doit être restreinte à l'adresse du site dans la console Google Cloud.
window.APP_CONFIG = {
  // Identifiant d'application (client) obtenu lors de l'inscription dans Azure / Entra ID.
  azureClientId: "00d3179b-fa47-44e3-a6e0-dfef10660693",

  // Clé API Google (Maps JavaScript API, Geocoding API, Places API (New), Routes API activées).
  googleApiKey: "AIzaSyC5Rt3Nj2q29Qs97vqxnb2wYsASdn9pCA0",

  // Compte Microsoft proposé d'office à la connexion (celui du OneDrive).
  compteMicrosoft: "rabec.dominique@orange.fr",

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
