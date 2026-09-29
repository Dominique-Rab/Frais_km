# Frais km : appli de frais kilométriques (iPhone et Android)

Cette appli web s'installe sur l'écran d'accueil du téléphone (PWA).
- Le conducteur choisit son véhicule, puis appuie sur **Démarrer** et sur **Arrivée**.
- À chaque appui, l'appli relève la position GPS et le nom du lieu (Google).
- À l'arrivée, elle calcule la distance routière proposée par Google Maps, puis le coût selon le barème fiscal.
- Le commentaire se saisit au clavier ou à la voix.
- Chaque trajet est ajouté à un fichier CSV sur votre **OneDrive**, directement lisible dans Excel.

La mise en service se fait en 4 étapes, à ne faire qu'une fois (environ 30 minutes).

---

## 1. Mettre l'appli en ligne (GitHub Pages, gratuit)

Le GPS d'un téléphone ne fonctionne que sur un site en **HTTPS**, d'où cette mise en ligne.

1. Créez un compte sur <https://github.com>.
2. Créez un dépôt, par exemple `frais-km`, en visibilité **Public**. GitHub Pages est gratuit pour les dépôts publics, et le code ne contient aucun secret.
3. Envoyez le contenu de ce dossier dans le dépôt : soit via *Add file → Upload files*, soit avec git.
4. Dans le dépôt, ouvrez *Settings → Pages → Source : Deploy from a branch → main / (root)*.
5. Notez l'adresse obtenue, par exemple `https://votre-compte.github.io/frais-km/`.

## 2. Autoriser l'accès à OneDrive (Microsoft Entra ID, gratuit)

1. Connectez-vous à <https://portal.azure.com> avec votre **compte Microsoft personnel**, celui du OneDrive.
2. Recherchez **Inscriptions d'applications**, puis cliquez sur **Nouvelle inscription**.
   - Nom : `Frais km`.
   - Types de comptes pris en charge : **Comptes Microsoft personnels uniquement**.
   - URI de redirection : plateforme **Application monopage (SPA)**, avec l'adresse de l'étape 1 (terminée par `/`).
3. Validez, puis copiez l'**ID d'application (client)**.
4. Dans **Authentification**, ajoutez une seconde URI SPA : `http://localhost:8000/`. Elle sert aux tests sur PC.
5. Dans **Autorisations des API**, cliquez sur *Ajouter → Microsoft Graph → Autorisations déléguées* et cochez **Files.ReadWrite.AppFolder**.

## 3. Créer la clé Google Maps

1. Ouvrez <https://console.cloud.google.com>, créez un projet et associez-y un compte de facturation. Une carte bancaire est obligatoire, mais le crédit mensuel gratuit couvre largement l'usage d'une PME.
2. Dans *API et services → Bibliothèque*, activez ces 3 API :
   - **Geocoding API** ;
   - **Places API (New)** ;
   - **Routes API**.
3. Dans *Identifiants → Créer des identifiants → Clé API*, créez la clé puis modifiez-la :
   - Restrictions relatives aux applications : **Sites Web**, avec les adresses `https://votre-compte.github.io/*` et `http://localhost:8000/*`.
   - Restrictions relatives aux API : les 3 API ci-dessus.
4. Conseil : dans *Facturation → Budgets et alertes*, créez une alerte à 5 €.

## 4. Renseigner la configuration

Ouvrez `js/config.js` et remplacez les deux `A_RENSEIGNER` :
- `azureClientId` : l'identifiant obtenu à l'étape 2 ;
- `googleApiKey` : la clé obtenue à l'étape 3.

Envoyez ensuite ce fichier modifié sur GitHub.

---

## Installation sur les téléphones

- **iPhone** : ouvrez l'adresse dans **Safari**, puis touchez *Partager → Sur l'écran d'accueil*.
- **Android** : ouvrez l'adresse dans **Chrome**, puis touchez *⋮ → Installer l'application* (ou *Ajouter à l'écran d'accueil*).

Au premier lancement :
1. Autorisez la **localisation** et le **micro**.
2. Touchez le bouton en haut à droite, **Se connecter**, et connectez-vous avec le compte Microsoft qui possède le OneDrive.
   - Cette connexion se fait avec **le même compte sur tous les téléphones**. Les conducteurs n'ont pas besoin de compte Microsoft.
3. Dans **Paramètres** (code PIN initial : `0000`) :
   - ajoutez les conducteurs et les véhicules (le €/km se remplit selon la puissance fiscale) ;
   - changez le code PIN ;
   - touchez **Enregistrer**.
   - Les paramètres sont partagés via OneDrive : les autres téléphones les reçoivent automatiquement.

## Utilisation

1. Choisissez le conducteur et le véhicule (ce choix est mémorisé).
2. Au départ, touchez **▶ Démarrer** : l'appli affiche le lieu, que vous pouvez corriger.
3. À l'arrivée, touchez **■ Arrivée** : l'appli affiche le lieu, la distance et le coût. La distance reste modifiable.
4. Saisissez l'objet du trajet, au clavier ou avec le bouton 🎤.
   - Sur iPhone, si le bouton 🎤 n'apparaît pas, utilisez le micro du clavier.
5. Touchez **Enregistrer le trajet**.

Quelques précisions :
- Vous pouvez fermer l'appli entre le départ et l'arrivée : le trajet en cours est conservé.
- **Sans réseau**, le trajet est enregistré sur le téléphone (⏳) et envoyé automatiquement plus tard.
- La connexion Microsoft **expire au bout d'environ 24 h** sur iPhone. Quand le bouton du haut affiche « ⚠ Se reconnecter », touchez-le : les trajets en attente partent alors.

## Les données dans Excel

Emplacement sur OneDrive : **Applications / Frais km /**
- `Trajets_2026.csv` : un fichier par année, une ligne par trajet ;
- `parametres.json` : les conducteurs, les véhicules et le barème.

Colonnes du fichier CSV : Date, Heure départ, Heure arrivée, Conducteur, Véhicule, Puissance (CV), Lieu départ, Lieu arrivée, Km, €/km, Coût (€), Commentaire, GPS départ, GPS arrivée, ID.

⚠ **Ne modifiez pas le fichier CSV directement** : l'appli y ajoute des lignes et vos modifications pourraient entrer en conflit avec les siennes. Pour travailler les données, faites plutôt l'une de ces deux choses :
- ouvrez le fichier et faites *Enregistrer sous → .xlsx* ailleurs ;
- dans Excel, utilisez *Données → À partir d'un fichier texte/CSV* : c'est une requête qui s'actualise, avec le séparateur `;` et l'encodage UTF-8.

En secours, l'onglet **Historique → Exporter CSV** produit le même fichier à partir des trajets enregistrés sur le téléphone.

## Barème kilométrique

Le barème pré-rempli est le barème fiscal 2025 (revenus 2024) pour les voitures, tranche « jusqu'à 5 000 km par an » :

| CV | 3 | 4 | 5 | 6 | 7 et + |
|---|---|---|---|---|---|
| €/km | 0,529 | 0,606 | 0,636 | 0,665 | 0,697 |

Les véhicules électriques bénéficient d'une majoration de 20 %.

Quand un nouveau barème est publié, mettez-le à jour dans **Paramètres** : l'appli propose alors de l'appliquer à tous les véhicules. Les trajets déjà enregistrés gardent le tarif en vigueur au moment du trajet.

## Tester sur PC

```
cd "frais kilometriques"
python -m http.server 8000
```

Ouvrez ensuite <http://localhost:8000/>. Sur PC, la position vient du Wi-Fi et elle est peu précise.
