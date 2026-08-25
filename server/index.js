"use strict";

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const jwt = require("jsonwebtoken");
const { fetchCompany } = require("./lib");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, ".."); // dossier contenant index.html

/* ------------------------------------------------------------------ *
 *  1) Static + routing : / , /siren/:siren  -> index.html
 *     (le front lit le SIREN dans l'URL et charge la fiche)
 * ------------------------------------------------------------------ */
app.use(express.static(ROOT, { index: false, extensions: ["html"] }));

function serveApp(_req, res) {
  res.sendFile(path.join(ROOT, "index.html"));
}
app.get("/", serveApp);
app.get("/siren/:siren", serveApp);

/* ------------------------------------------------------------------ *
 *  2) Apple Wallet : génération d'un .pkpass signé
 * ------------------------------------------------------------------ */
const APPLE = {
  wwdr: process.env.APPLE_WWDR_CERT, // chemin .pem
  signerCert: process.env.APPLE_SIGNER_CERT, // chemin .pem
  signerKey: process.env.APPLE_SIGNER_KEY, // chemin .pem (clé privée)
  signerKeyPassphrase: process.env.APPLE_SIGNER_KEY_PASSPHRASE || "",
  passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID, // pass.com.votredomaine.facturation
  teamIdentifier: process.env.APPLE_TEAM_ID,
  model: path.join(__dirname, "models", "facturation.pass"),
};

// Charge un certificat depuis : un chemin de fichier, un PEM inline, ou du
// base64 (pratique pour les secrets Railway/Fly.io où l'on ne monte pas de fichier).
function loadCredential(value) {
  if (!value) return null;
  if (fs.existsSync(value)) return fs.readFileSync(value);
  if (value.includes("BEGIN")) return value;
  try {
    const dec = Buffer.from(value, "base64").toString("utf8");
    if (dec.includes("BEGIN")) return dec;
  } catch (_) {}
  return value;
}

function appleConfigured() {
  return (
    APPLE.wwdr && APPLE.signerCert && APPLE.signerKey &&
    APPLE.passTypeIdentifier && APPLE.teamIdentifier && fs.existsSync(APPLE.model)
  );
}

app.get("/api/wallet/apple/:siren", async (req, res) => {
  if (!appleConfigured()) {
    return res.status(501).json({
      error: "Apple Wallet non configuré",
      needed: [
        "APPLE_WWDR_CERT", "APPLE_SIGNER_CERT", "APPLE_SIGNER_KEY",
        "APPLE_PASS_TYPE_ID", "APPLE_TEAM_ID",
        "modèle server/models/facturation.pass (pass.json + icônes)",
      ],
    });
  }
  try {
    const { PKPass } = require("passkit-generator");
    const c = await fetchCompany(req.params.siren);

    const pass = await PKPass.from(
      {
        model: APPLE.model,
        certificates: {
          wwdr: loadCredential(APPLE.wwdr),
          signerCert: loadCredential(APPLE.signerCert),
          signerKey: loadCredential(APPLE.signerKey),
          signerKeyPassphrase: APPLE.signerKeyPassphrase,
        },
      },
      {
        passTypeIdentifier: APPLE.passTypeIdentifier,
        teamIdentifier: APPLE.teamIdentifier,
        serialNumber: c.siren,
        description: "Fiche de facturation " + c.nom,
        organizationName: c.nom,
      }
    );

    // Champs de la carte (type "generic" dans le pass.json modèle)
    pass.primaryFields.push({ key: "name", label: "Entreprise", value: c.nom });
    pass.secondaryFields.push(
      { key: "siren", label: "SIREN", value: c.siren },
      { key: "tva", label: "N° TVA", value: c.tva }
    );
    pass.auxiliaryFields.push(
      { key: "siret", label: "SIRET", value: c.siret || "—" },
      { key: "ape", label: "Code APE", value: c.naf || "—" }
    );
    pass.backFields.push({ key: "adresse", label: "Adresse", value: c.adresse || "—" });

    const qr = [c.nom, "SIREN : " + c.siren, "TVA : " + c.tva, c.siret ? "SIRET : " + c.siret : ""]
      .filter(Boolean).join("\n");
    pass.setBarcodes({ format: "PKBarcodeFormatQR", message: qr, messageEncoding: "iso-8859-1" });

    const buffer = pass.getAsBuffer();
    res.set({
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="${c.siren}.pkpass"`,
    });
    res.send(buffer);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ *
 *  3) Google Wallet : lien "Save to Wallet" via JWT signé
 * ------------------------------------------------------------------ */
const GOOGLE = {
  issuerId: process.env.GOOGLE_ISSUER_ID,
  classId: process.env.GOOGLE_CLASS_ID, // ex : ISSUER_ID.facturation_class
  saEmail: process.env.GOOGLE_SA_EMAIL, // client_email du compte de service
  saKey: process.env.GOOGLE_SA_PRIVATE_KEY, // clé privée PEM (ou chemin fichier)
};

function googleConfigured() {
  return GOOGLE.issuerId && GOOGLE.classId && GOOGLE.saEmail && GOOGLE.saKey;
}

function googlePrivateKey() {
  // Accepte : fichier JSON de compte de service, fichier .pem, JSON/PEM en
  // base64 (secret cloud), ou clé PEM inline (avec \n échappés dans le .env).
  const v = GOOGLE.saKey;
  if (fs.existsSync(v)) {
    const raw = fs.readFileSync(v, "utf8");
    return v.endsWith(".json") ? JSON.parse(raw).private_key : raw;
  }
  try {
    const dec = Buffer.from(v, "base64").toString("utf8");
    if (dec.trim().startsWith("{")) return JSON.parse(dec).private_key;
    if (dec.includes("BEGIN")) return dec;
  } catch (_) {}
  return v.replace(/\\n/g, "\n");
}

app.get("/api/wallet/google/:siren", async (req, res) => {
  if (!googleConfigured()) {
    return res.status(501).json({
      error: "Google Wallet non configuré",
      needed: ["GOOGLE_ISSUER_ID", "GOOGLE_CLASS_ID", "GOOGLE_SA_EMAIL", "GOOGLE_SA_PRIVATE_KEY"],
    });
  }
  try {
    const c = await fetchCompany(req.params.siren);
    const qr = [c.nom, "SIREN : " + c.siren, "TVA : " + c.tva].join("\n");

    const genericObject = {
      id: `${GOOGLE.issuerId}.siren-${c.siren}`,
      classId: GOOGLE.classId,
      state: "ACTIVE",
      cardTitle: { defaultValue: { language: "fr", value: "Fiche facturation" } },
      header: { defaultValue: { language: "fr", value: c.nom } },
      textModulesData: [
        { id: "siren", header: "SIREN", body: c.siren },
        { id: "tva", header: "N° TVA", body: c.tva },
        { id: "siret", header: "SIRET", body: c.siret || "—" },
        { id: "adresse", header: "Adresse", body: c.adresse || "—" },
      ],
      barcode: { type: "QR_CODE", value: qr },
      hexBackgroundColor: "#111a2e",
    };

    const claims = {
      iss: GOOGLE.saEmail,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(Date.now() / 1000),
      payload: { genericObjects: [genericObject] },
    };

    const token = jwt.sign(claims, googlePrivateKey(), { algorithm: "RS256" });
    res.json({ saveUrl: "https://pay.google.com/gp/v/save/" + token });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`▶ Ma Fiche Facturation — http://localhost:${PORT}`);
  console.log(`  Apple Wallet  : ${appleConfigured() ? "activé ✅" : "non configuré (fallback front)"}`);
  console.log(`  Google Wallet : ${googleConfigured() ? "activé ✅" : "non configuré (fallback front)"}`);
});
