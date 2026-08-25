"use strict";

/**
 * Récupération des données entreprise côté serveur + calcul du N° de TVA.
 * On réutilise l'annuaire public api.gouv.fr, comme le front.
 */

// N° de TVA intracommunautaire : FR + clé + SIREN
// clé = (12 + 3 * (SIREN mod 97)) mod 97
function tvaFromSiren(siren) {
  const s = BigInt(siren);
  const key = (12n + 3n * (s % 97n)) % 97n;
  return "FR" + String(key).padStart(2, "0") + siren;
}

function luhnValid(num) {
  let sum = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

async function fetchCompany(siren) {
  if (!/^\d{9}$/.test(siren) || !luhnValid(siren)) {
    const err = new Error("SIREN invalide");
    err.status = 400;
    throw err;
  }
  const url = `https://recherche-entreprises.api.gouv.fr/search?q=${siren}&page=1&per_page=5`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const err = new Error("Annuaire indisponible (" + res.status + ")");
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  const hit = (data.results || []).find((r) => r.siren === siren) || (data.results || [])[0];
  if (!hit || hit.siren !== siren) {
    const err = new Error("Entreprise introuvable");
    err.status = 404;
    throw err;
  }
  const s = hit.siege || {};
  return {
    siren,
    siret: s.siret || "",
    nom: hit.nom_complet || hit.nom_raison_sociale || "Entreprise",
    tva: tvaFromSiren(siren),
    naf: hit.activite_principale || s.activite_principale || "",
    adresse: s.adresse || "",
  };
}

module.exports = { tvaFromSiren, luhnValid, fetchCompany };
