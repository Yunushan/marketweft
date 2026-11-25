<!-- MarketWeft README · locale=fr -->

# MarketWeft

**0.3.0 · 0BSD**

**Langues de la documentation**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · **Français** · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## Fonctionnement de MarketWeft

MarketWeft est un terminal de recherche local destiné aux analystes, développeurs et opérateurs. Il ouvre des fichiers OHLCV autorisés, trace des chandeliers et les volumes, calcule SMA et EMA en virgule fixe et enregistre liste, instrument et indicateurs dans IndexedDB. Les ressources mises en cache permettent de travailler hors ligne. Les cours et volumes fournis sont synthétiques et ne nécessitent aucun compte.

La version 0.3.0 ajoute la relecture historique d’une série immuable par séance. Le dépôt fournit aussi un SDK TypeScript d’observation de trading-bot en lecture seule et une enveloppe Tauri expérimentale. Opérations sur titres, flux distants, ordres, hébergement multiutilisateur et installateurs signés figurent dans la feuille de route.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## Démarrer le terminal portable

Téléchargez browser-terminal-attempt-N depuis une vérification GitHub réussie et extrayez MarketWeft-browser-0.3.0.zip. Conservez dist/ à côté de serve-terminal.mjs et exécutez la commande ci-dessous dans ce répertoire. Ouvrez http://127.0.0.1:4173/ avec un navigateur récent offrant WebAssembly, Canvas, BigInt et IndexedDB. Le lanceur exige Node.js 22.12 ou supérieur. Aucune installation npm n’est nécessaire. Attendez Offline ready avant la déconnexion.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## Relire l’exemple du NYSE

Ouvrez Historical replay puis Start demo. Next event avance d’un événement, Previous event recule, Play et Pause gèrent la lecture et Reset efface l’historique visible. Le graphique est vide au départ. Chaque bougie apparaît à la fin de son intervalle. Event time indique son début ou la borne de séance. Observed at indique la disponibilité. La vitesse agit uniquement sur l’affichage.

L’ouverture passe de 13:30 UTC (UTC−04:00) le 31 octobre 2025 à 14:30 UTC (UTC−05:00) le 3 novembre. L’absence de la bougie de 15:00 est signalée à 15:30. Thanksgiving n’émet aucun créneau. Le 28 novembre ferme à 18:00 UTC après sept bougies de 30 minutes. Les 20 séances, 253 bougies et 294 événements s’appuient sur des valeurs synthétiques et les horaires publics du NYSE.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv)

<!-- section:04 -->
## Importer et relire ses données

Avec Import CSV, saisissez la place et le symbole et choisissez un OHLCV UTF-8 autorisé. Fournissez des secondes Unix, dates UTC ou horodatages UTC terminés par Z, en ordre strictement croissant. Limitez les décimales à six, utilisez un volume positif ou nul et encadrez l’ouverture et la clôture. Une ligne invalide annule l’import. Series details accepte l’intervalle, la source, le droit d’usage et la politique d’ajustement.

Pour la relecture, horodatez chaque bougie à son début. Dans Historical replay sélectionnez l’instrument, ajoutez le calendrier CSV et saisissez l’intervalle en secondes entières (1 à 86 400). Chaque ligne donne les bornes UTC, le décalage à l’ouverture et regular ou early. La grille part de l’ouverture et la dernière tranche peut finir plus tôt. Les bougies hors séance ou hors grille sont rejetées. Un manque fait avancer l’horloge et conserve le dernier cours.

Par défaut, chaque import accepte 1 500 000 octets et 100 000 bougies. La configuration peut atteindre 8 Mio et 100 000 lignes. Le calendrier accepte 1 Mio, 10 000 segments disjoints et 200 000 événements. Les quotas du navigateur s’appliquent aussi.

```csv
time,open,high,low,close,volume
2025-11-28T14:30:00Z,10,12,9,11,200.000001
2025-11-28T15:00:00Z,11,13,10,12,150
```

```csv
date,open_utc,close_utc,utc_offset_minutes,kind
2025-11-28,2025-11-28T14:30:00Z,2025-11-28T18:00:00Z,-300,early
```

[apps/terminal/README.md](../../apps/terminal/README.md) · [crates/core/README.md](../../crates/core/README.md)

<!-- section:05 -->
## Sauvegarder, migrer et restaurer

Workspace backup → Export workspace enregistre un JSON versionné avec les CSV d’origine, la provenance, les historiques visibles et masqués, la liste ordonnée, la sélection et les indicateurs. Dans le profil cible, choisissez Backup file, vérifiez les totaux et sélectionnez Restore workspace. Le catalogue cible est remplacé dans une transaction. Exportez d’abord la destination si elle doit être conservée.

Pour une mise à jour, conservez schéma, hôte, port et profil. La migration 0.1.0 vers IndexedDB relit les données et conserve la valeur d’origine. Fermez les anciens onglets. Le fichier de sauvegarde est en clair. SHA-256 vérifie l’intégrité. Les droits d’usage déterminent le stockage, l’accès et la conservation.

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## Architecture et calcul

Rust valide les instruments et le CSV, calcule en millionièmes entiers et prépare les événements de séance. React utilise ce même moteur en Wasm. Canvas trace les bougies, IndexedDB effectue les transactions et un service worker met les ressources en cache. Les révisions détectent les écritures concurrentes. L’état dépend du profil et de l’origine.

La SMA utilise une somme glissante exacte. L’EMA débute à la première fenêtre complète et arrondit au millionième à chaque étape, en s’éloignant de zéro à mi-distance. La relecture ne prend en compte que les clôtures déjà observées. La fin du créneau détermine la disponibilité. Arrivées réelles, corrections et horodatages intrabougie nécessitent leurs propres données. Les lignes importées restent intactes.

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## Déploiement et exploitation

Servez dist/ via HTTPS ou utilisez le lanceur en boucle locale. Le même profil et la même origine retrouvent les données. Autre port, autre profil ou navigation privée ouvrent un stockage distinct. Pour évaluer Tauri, compilez le terminal et installez les prérequis. CI compile sur Windows Server 2022, macOS 15 et Ubuntu 24.04 et ouvre la fenêtre Linux. La matrice détaille mobile, ARM et BSD. Reproduisez les tests avec Chromium de bureau.

Le modèle actuel prévoit un utilisateur local par profil. Utilisez des appareils approuvés pour les fichiers. Authentification, cloisonnement, surveillance et objectifs de rétention et de récupération relèvent d’un déploiement validé séparément. Le ZIP fournit les avis et un SBOM CycloneDX. Les versions étiquetées intègrent l’attestation.

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## Observer un service externe

Le SDK TradingBotObserverV1 lit runtime, status, account et portfolio auprès d’un trading-bot configuré séparément. Utilisez une origine fiable, HTTPS hors boucle locale et un jeton autorisé transmis par le processus. Lisez chaque instantané à sa date d’observation. Un état sain ou un instantané vide ne renseigne pas sur d’autres soldes ou positions. Les identifiants, ordres et opérations dépendent du service externe.

```js
import { TradingBotObserverV1 } from "@marketweft/trading-bot";

const observer = new TradingBotObserverV1({
  baseUrl: process.env.TRADING_BOT_URL ?? "http://127.0.0.1:8000",
  token: process.env.TRADING_BOT_TOKEN,
});
const snapshot = await observer.account();
console.log(snapshot.observedAt, snapshot.totalBalance, snapshot.currency);
```

[docs/trading-bot.md](../../docs/trading-bot.md) · [trading-bot](https://github.com/Yunushan/trading-bot)

<!-- section:09 -->
## Compiler et vérifier

Utilisez Node.js 22.12 ou supérieur avec npm, Rustup selon rust-toolchain.toml et Python 3.11 ou supérieur. Lancez les commandes à la racine. Vite indique l’URL de développement, généralement sur 5173. La production utilise 4173. Installez le Chromium verrouillé avant les tests.

Les contrôles couvrent Rust natif, Wasm, navigateur, SDK, serveur local, licences, SBOM et avis de sécurité. Chaque préfixe des deux moyennes concorde avec le calcul par lots, y compris changement d’heure, absence et fermeture anticipée. CI attend l’identifiant exact du ZIP et compare le fichier téléchargé octet par octet. Une étiquette de version concordante déclenche l’attestation.

```sh
git clone https://github.com/Yunushan/marketweft.git
cd marketweft
npm ci
npm run dev
```

```sh
node scripts/build-wasm.mjs
npm run build
node scripts/serve-terminal.mjs
```

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo clippy --locked --target wasm32-unknown-unknown -- -D warnings
cargo test --workspace --locked
node --experimental-strip-types --test scripts/core-wasm.test.mjs
node --test scripts/serve-terminal.test.mjs
npx --no-install playwright install chromium
npm test
cargo fetch --locked --manifest-path apps/desktop/Cargo.toml
python -B scripts/test_supply_chain.py
python -B scripts/supply_chain.py --check
python -B scripts/check_readmes.py
npm audit --audit-level=high
python -B scripts/advisories.py
python -B scripts/package_browser.py
```

[verify.yml](../../.github/workflows/verify.yml) · [docs/native-advisories.md](../../docs/native-advisories.md)

<!-- section:10 -->
## Diagnostiquer et reproduire

Si le port est occupé, lancez avec --port 4174 et utilisez l’export et la restauration pour déplacer les données. Pour l’accès hors ligne, ouvrez d’abord la production en ligne et attendez Offline ready. Pour un refus, vérifiez la ligne signalée, le début de chaque bougie ainsi que les dates et séances du marché.

Conservez CSV, calendrier, intervalle, révision Git, version du navigateur et horodatage de l’événement. Signalez le premier échec avec un exemple synthétique. Le dossier de vérification détaille les plateformes et la feuille de route donne les prochaines cibles.

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## Dépôt, contributions et licence

Le moteur et ses jeux de données sont dans crates/core, le terminal dans apps/terminal, l’hôte dans apps/desktop, le SDK dans packages/trading-bot et les outils dans scripts. Préférez de petits changements testés. Respectez les droits et avis, régénérez l’inventaire après modification des dépendances et signalez les vulnérabilités en privé.

Le code original est sous 0BSD. Les dépendances conservent leurs licences. Les éditions intégrales suivent le nombre total de locuteurs natifs et de seconde langue d’Ethnologue 2026, y compris les deux langues à égalité arrondie en vingtième position. Les manuels liés et l’interface peuvent être en anglais.

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
