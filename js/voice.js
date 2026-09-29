// Dictée vocale du commentaire (Web Speech API). Si elle n'est pas disponible,
// le bouton micro est masqué : la dictée du clavier du téléphone reste possible.

const Reconnaissance = window.SpeechRecognition || window.webkitSpeechRecognition;

export const dicteeDisponible = () => !!Reconnaissance;

// Démarre l'écoute ; renvoie une fonction pour l'arrêter.
// surTexte(texteFinal, texteProvisoire) est appelé au fil de la dictée.
export function ecouter(surTexte, surFin) {
  const rec = new Reconnaissance();
  rec.lang = "fr-FR";
  rec.interimResults = true;
  rec.continuous = false;
  let final = "";
  rec.onresult = (e) => {
    let provisoire = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else provisoire += e.results[i][0].transcript;
    }
    surTexte(final, provisoire);
  };
  rec.onerror = (e) => surFin(e.error === "not-allowed" ? "Micro refusé : autorisez-le dans les réglages." : null);
  rec.onend = () => surFin(null);
  rec.start();
  return () => rec.stop();
}
