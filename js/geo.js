// GPS du téléphone + services Google : nom du lieu (Geocoding + Places) et
// distance routière (Routes API). Aucun itinéraire n'est affiché.

const cfg = window.APP_CONFIG;

export const googleConfigure = () => !!cfg.googleApiKey && !cfg.googleApiKey.startsWith("A_RENSEIGNER");

// Suit la position jusqu'à obtenir la précision visée, ou jusqu'au délai max ;
// renvoie alors la meilleure position reçue.
export function positionGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("GPS non disponible sur cet appareil."));
    let meilleure = null;
    let fini = false;
    const terminer = (erreur) => {
      if (fini) return;
      fini = true;
      navigator.geolocation.clearWatch(id);
      clearTimeout(minuteur);
      if (meilleure) resolve(meilleure);
      else reject(erreur || new Error("Position GPS introuvable."));
    };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy) };
        if (!meilleure || pos.precision < meilleure.precision) meilleure = pos;
        if (pos.precision <= cfg.precisionGpsMetres) terminer();
      },
      (e) => {
        const messages = {
          1: "Accès à la position refusé. Autorisez la localisation pour cette appli dans les réglages du téléphone.",
          2: "Position indisponible (GPS désactivé ?).",
          3: "Délai GPS dépassé.",
        };
        terminer(new Error(messages[e.code] || e.message));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: cfg.delaiGpsSecondes * 1000 }
    );
    const minuteur = setTimeout(() => terminer(new Error("Délai GPS dépassé.")), cfg.delaiGpsSecondes * 1000);
  });
}

export const coordonneesTexte = (p) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

async function adresse(p) {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json" +
    `?latlng=${p.lat},${p.lng}&language=fr&key=${encodeURIComponent(cfg.googleApiKey)}`;
  const r = await fetch(url);
  const json = await r.json();
  if (json.status !== "OK" || !json.results?.length) throw new Error(`Geocoding : ${json.status} ${json.error_message || ""}`);
  return json.results[0].formatted_address.replace(/, France$/, "");
}

async function lieuProche(p) {
  const r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": cfg.googleApiKey,
      "X-Goog-FieldMask": "places.displayName",
    },
    body: JSON.stringify({
      locationRestriction: { circle: { center: { latitude: p.lat, longitude: p.lng }, radius: cfg.rayonLieuMetres } },
      rankPreference: "DISTANCE",
      maxResultCount: 1,
      languageCode: "fr",
    }),
  });
  if (!r.ok) throw new Error(`Places : ${r.status}`);
  const json = await r.json();
  return json.places?.[0]?.displayName?.text || null;
}

// « Nom du lieu – adresse » si un lieu connu est tout proche, sinon l'adresse,
// et en dernier recours les coordonnées.
export async function nomDuLieu(p) {
  if (!googleConfigure()) return coordonneesTexte(p);
  const [adr, lieu] = await Promise.allSettled([adresse(p), lieuProche(p)]);
  const a = adr.status === "fulfilled" ? adr.value : null;
  const l = lieu.status === "fulfilled" ? lieu.value : null;
  if (a && l && !a.startsWith(l)) return `${l} – ${a}`;
  if (a || l) return a || l;
  throw adr.reason || lieu.reason;
}

// Distance routière (km, 1 décimale) du trajet proposé par Google.
export async function distanceRouteKm(depart, arrivee) {
  if (!googleConfigure()) throw new Error("Clé Google non configurée.");
  const point = (p) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": cfg.googleApiKey,
      "X-Goog-FieldMask": "routes.distanceMeters",
    },
    body: JSON.stringify({
      origin: point(depart),
      destination: point(arrivee),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      languageCode: "fr-FR",
      units: "METRIC",
    }),
  });
  if (!r.ok) throw new Error(`Routes : ${r.status}`);
  const json = await r.json();
  const metres = json.routes?.[0]?.distanceMeters;
  if (metres == null) {
    // Départ et arrivée identiques : Google renvoie une route sans distance.
    if (json.routes?.length) return 0;
    throw new Error("Aucune route trouvée entre le départ et l'arrivée.");
  }
  return Math.round(metres / 100) / 10;
}
