# Déploiement (Railway / Fly.io)

L'app tourne en conteneur : le serveur Node sert la one-page **et** l'API de
signature Wallet. Fichiers fournis : `Dockerfile`, `.dockerignore`, `fly.toml`.

Prérequis : le projet doit être dans un dépôt git.

```bash
cd siren-facturation
git init && git add . && git commit -m "Ma Fiche Facturation"
```

---

## Option A — Railway (le plus simple, pas de CLI)

1. Poussez le dépôt sur GitHub.
2. Sur **railway.app** → *New Project* → *Deploy from GitHub repo* → choisissez le repo.
3. Railway détecte le `Dockerfile` et build automatiquement.
   (Il injecte `PORT` tout seul — le serveur l'utilise déjà.)
4. *Settings → Networking → Generate Domain* pour obtenir une URL publique HTTPS.
5. Testez : `https://VOTRE-APP.up.railway.app/siren/819904988`

Variables Wallet (quand vous aurez vos certificats) : onglet **Variables**, voir
la section « Secrets » plus bas.

---

## Option B — Fly.io (pas de mise en veille, CLI)

```bash
# 1. Installer + se connecter
brew install flyctl        # ou : curl -L https://fly.io/install.sh | sh
fly auth login

# 2. Créer l'app (utilise fly.toml + Dockerfile ; refusez la base de données)
fly launch --no-deploy     # choisissez un nom d'app unique

# 3. Déployer
fly deploy

# 4. URL publique HTTPS
#    https://VOTRE-APP.fly.dev/siren/819904988
```

---

## Secrets Wallet (identiques aux deux plateformes)

Les certificats ne sont **pas** commités : on les passe en variables d'env. Le
serveur accepte un **chemin de fichier OU un contenu base64** — en cloud, on
utilise le base64.

### Encoder les certificats Apple en base64
```bash
# macOS
base64 -i certs/wwdr.pem | pbcopy          # colle la valeur dans le secret
base64 -i certs/signerCert.pem
base64 -i certs/signerKey.pem
```

### Fly.io — via CLI
```bash
fly secrets set \
  APPLE_TEAM_ID=XXXXXXXXXX \
  APPLE_PASS_TYPE_ID=pass.com.votredomaine.facturation \
  APPLE_WWDR_CERT="$(base64 -i certs/wwdr.pem)" \
  APPLE_SIGNER_CERT="$(base64 -i certs/signerCert.pem)" \
  APPLE_SIGNER_KEY="$(base64 -i certs/signerKey.pem)" \
  APPLE_SIGNER_KEY_PASSPHRASE=... \
  GOOGLE_ISSUER_ID=3388000000000000000 \
  GOOGLE_CLASS_ID=3388000000000000000.facturation_class \
  GOOGLE_SA_EMAIL=wallet@projet.iam.gserviceaccount.com \
  GOOGLE_SA_PRIVATE_KEY="$(base64 -i certs/google-sa.json)"
```

### Railway — via l'interface
Onglet **Variables** → ajoutez les mêmes clés. Pour les valeurs base64, générez-les
localement (`base64 -i fichier`) et collez le résultat.

> Note Apple : les **icônes** (`icon.png`, `icon@2x.png`, …) doivent être présentes
> dans `server/models/facturation.pass/` — elles sont dans l'image Docker, donc
> commitez-les (elles ne sont pas secrètes). Sans elles, la route Apple renvoie 501
> et le front bascule sur le fallback JSON.

---

## Domaine personnalisé (optionnel)
- **Railway** : Settings → Networking → *Custom Domain* → ajoutez un CNAME.
- **Fly.io** : `fly certs add facturation.votredomaine.fr` puis pointez le DNS.

HTTPS est fourni automatiquement dans les deux cas (requis par Apple/Google Wallet).
