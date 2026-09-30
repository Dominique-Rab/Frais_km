// GPS du téléphone + services Google : nom du lieu (Geocoding + Places) et
// distance routière (Routes API). Aucun itinéraire n'est affiché.

const cfg = window.APP_CONFIG;

// Sur réseau mobile faible, une requête peut ne jamais aboutir : chaque appel
// Google a donc un délai maximum.
export function limiteTemps(promesse, ms, libelle) {
  let minuteur;
  const delai = new Promise((_, ko) => {
    minuteur = setTimeout(() => ko(new Error(`${libelle} : pas de réponse (réseau ?)`)), ms);
  });
  return Promise.race([promesse, delai]).finally(() => clearTimeout(minuteur));
}

function fetchLimite(url, options, ms, libelle) {
  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), ms);
  return fetch(url, { ...options, signal: arret.signal })
    .catch((e) => {
      throw e.name === "AbortError" ? new Error(`${libelle} : pas de réponse (réseau ?)`) : e;
    })
    .finally(() => clearTimeout(minuteur));
}

export const googleConfigure = () => !!cfg.googleApiKey && !cfg.googleApiKey.startsWith("A_RENSEIGNER");

// Suit la position jusqu'à obtenir la précision visée, ou jusqu'au délai max ;
// renvoie alors la meilleure position reçue.
// Quand l'appli sort de veille, iOS peut d'abord renvoyer la dernière position
// connue (parfois vieille de plusieurs minutes) malgré maximumAge: 0 : les
// positions datées d'avant l'appel sont écartées. Si aucune position récente
// n'arrive, la meilleure ancienne est renvoyée avec ancienne = true.
export function positionGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("GPS non disponible sur cet appareil."));
    const debut = Date.now();
    let meilleure = null;
    let meilleureAncienne = null;
    let fini = false;
    const terminer = (erreur) => {
      if (fini) return;
      fini = true;
      navigator.geolocation.clearWatch(id);
      clearTimeout(minuteur);
      if (meilleure) resolve(meilleure);
      else if (meilleureAncienne) resolve({ ...meilleureAncienne, ancienne: true });
      else reject(erreur || new Error("Position GPS introuvable."));
    };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy) };
        // Horodatage incohérent (écart > 1 jour) : on ne peut pas juger, la position est acceptée.
        const recente = p.timestamp >= debut - 2000 || Math.abs(Date.now() - p.timestamp) > 86400000;
        if (!recente) {
          if (!meilleureAncienne || pos.precision < meilleureAncienne.precision) meilleureAncienne = pos;
          return;
        }
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

// Le service web Geocoding refuse les clés restreintes à des sites web :
// on passe par le Geocoder de l'API Maps JavaScript, chargée à la première utilisation.
let chargementMaps = null;

function chargerMapsJs() {
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (!chargementMaps) {
    chargementMaps = new Promise((ok, ko) => {
      window.__fraisKmMapsPret = ok;
      const s = document.createElement("script");
      s.src =
        "https://maps.googleapis.com/maps/api/js" +
        `?key=${encodeURIComponent(cfg.googleApiKey)}&v=weekly&loading=async&language=fr&region=FR&callback=__fraisKmMapsPret`;
      s.async = true;
      s.onerror = () => {
        chargementMaps = null;
        s.remove();
        ko(new Error("Google Maps injoignable."));
      };
      document.head.appendChild(s);
    });
  }
  return limiteTemps(chargementMaps, 10000, "Google Maps").catch((e) => {
    chargementMaps = null;
    throw e;
  });
}

async function adresse(p) {
  await chargerMapsJs();
  const { Geocoder } = await google.maps.importLibrary("geocoding");
  const { results } = await limiteTemps(new Geocoder().geocode({ location: { lat: p.lat, lng: p.lng } }), 8000, "Adresse");
  if (!results?.length) throw new Error("Geocoding : aucune adresse.");
  return results[0].formatted_address.replace(/, France$/, "");
}

async function lieuProche(p) {
  const r = await fetchLimite("https://places.googleapis.com/v1/places:searchNearby", {
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
  }, 8000, "Nom du lieu");
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
  const r = await fetchLimite("https://routes.googleapis.com/directions/v2:computeRoutes", {
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
  }, 10000, "Distance");
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
