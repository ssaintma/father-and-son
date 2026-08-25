# Ma Fiche Facturation

One-page pour récupérer les données légales d'une entreprise à partir de son
**SIREN**, calculer son **N° de TVA intracommunautaire**, et l'exporter vers
**Apple Wallet / Google Wallet** — pensé pour la facturation électronique 2026.

## Deux modes d'utilisation

### A. Statique (le plus simple)
Ouvrez `index.html` directement, ou déposez le dossier sur un hébergeur statique
(Netlify, GitHub Pages, Cloudflare Pages…). Tout fonctionne **sauf** la génération
de vrais passes Wallet : les boutons proposent alors le téléchargement du contenu
de la carte (`.json`) prêt à signer.

- URL bookmarkable : `https://votre-site/siren/819904988`
  (le fichier `_redirects` gère la réécriture sur Netlify ; voir plus bas pour nginx).

### B. Avec backend (vrais passes Wallet signés)
```bash
cd server
npm install
cp .env.example .env      # puis renseignez vos certificats
npm start                 # http://localhost:3000
```
Le serveur sert l'app **et** expose :
- `GET /siren/:siren` → la fiche (bookmarkable, refresh OK)
- `GET /api/wallet/apple/:siren` → `.pkpass` signé
- `GET /api/wallet/google/:siren` → `{ saveUrl }` (lien Google Wallet)

Tant que les certificats ne sont pas configurés, ces routes renvoient `501` et le
front bascule automatiquement sur le mode statique (aucune erreur visible).

## Configurer Apple Wallet
1. Compte **Apple Developer**. Créez un *Pass Type ID* (`pass.com.votredomaine.facturation`).
2. Générez le certificat, exportez-le en `.p12`, puis convertissez en `.pem` :
   ```bash
   openssl pkcs12 -in Certificates.p12 -clcerts -nokeys -out certs/signerCert.pem
   openssl pkcs12 -in Certificates.p12 -nocerts -out certs/signerKey.pem
   # WWDR (Apple Worldwide Developer Relations) :
   openssl x509 -inform der -in AppleWWDRCAG4.cer -out certs/wwdr.pem
   ```
3. Ajoutez les **icônes** requises dans `server/models/facturation.pass/` :
   `icon.png` (29×29), `icon@2x.png` (58×58), `logo.png`, `logo@2x.png`.
4. Renseignez `APPLE_*` dans `.env`.

## Configurer Google Wallet
1. Activez **Google Wallet API**, créez un *Issuer account* → notez l'`ISSUER_ID`.
2. Créez une **classe générique** `ISSUER_ID.facturation_class`.
3. Créez un **compte de service**, téléchargez sa clé JSON dans `server/certs/`.
4. Renseignez `GOOGLE_*` dans `.env`.

## Config nginx (URLs propres sans Netlify)
```nginx
location /siren/ { try_files $uri /index.html; }
```

## Sources & calculs
- Données : annuaire public **recherche-entreprises.api.gouv.fr** (INSEE/RNE), sans clé.
- N° TVA : `FR` + `(12 + 3×(SIREN mod 97)) mod 97` + SIREN.
- Aucune donnée n'est stockée : tout est calculé/récupéré à la volée.
