#!/usr/bin/env bash
#
# Korjaa GOOGLE_SERVICE_ACCOUNT_KEY:n development-ympäristöön.
#
# Muuttuja on katkennut: arvo on kolme merkkiä (`"{"`) sekä Vercelin
# development-ympäristössä että .env.localissa, joten JSON.parse kaatuu ja
# kaikki palvelutiliä käyttävä työ (RJ-Mobin Sheets-luku, Driven ohjeet,
# watchin lähdelista) on paikallisesti poikki. Tuotanto on kunnossa.
#
# Arvoa ei voi kopioida tuotannosta: se on merkitty Sensitiveksi eikä sitä
# saa takaisin millään CLI-komennolla. Siksi tarvitaan palvelutilin oma
# JSON-avaintiedosto.
#
# Käyttö:
#   ./scripts/korjaa-dev-avain.sh ~/Downloads/palvelutili.json
#
set -euo pipefail

TIEDOSTO="${1:-}"

if [ -z "$TIEDOSTO" ]; then
  cat <<'OHJE'
Anna palvelutilin JSON-tiedoston polku:

  ./scripts/korjaa-dev-avain.sh ~/Downloads/palvelutili.json

Mistä tiedosto saadaan:
  Google Cloud Console -> IAM & Admin -> Service Accounts -> valitse tili
  -> Keys -> Add key -> Create new key -> JSON -> Create.
  Selain lataa tiedoston. Vanhaa avainta ei tarvitse poistaa.
OHJE
  exit 1
fi

if [ ! -f "$TIEDOSTO" ]; then
  echo "Tiedostoa ei löydy: $TIEDOSTO" >&2
  exit 1
fi

# Tarkistetaan ennen kuin mitään muutetaan: kelvoton tiedosto ei saa päätyä
# Verceliin, koska juuri se on nykyinen vika.
YHDELLA_RIVILLA=$(node -e '
  const fs = require("fs")
  const raw = fs.readFileSync(process.argv[1], "utf8")
  let key
  try { key = JSON.parse(raw) } catch (e) { console.error("Tiedosto ei ole kelvollista JSONia: " + e.message); process.exit(1) }
  for (const kentta of ["type", "project_id", "client_email", "private_key"]) {
    if (!key[kentta]) { console.error("JSONista puuttuu kenttä: " + kentta); process.exit(1) }
  }
  if (!String(key.private_key).includes("BEGIN PRIVATE KEY")) {
    console.error("private_key ei näytä yksityiseltä avaimelta")
    process.exit(1)
  }
  // Yhdelle riville. private_keyn rivinvaihdot säilyvät \n-escapeina, mikä on
  // oikein: niitä EI saa korvata, korvaus rikkoo avaimen.
  process.stdout.write(JSON.stringify(key))
' "$TIEDOSTO")

TILI=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).client_email)' "$YHDELLA_RIVILLA")
echo "Avain kelpaa. Palvelutili: $TILI"
echo "Pituus yhdellä rivillä: ${#YHDELLA_RIVILLA} merkkiä (nykyinen rikkinäinen on 3)."
echo
read -r -p "Korvataanko development-ympäristön GOOGLE_SERVICE_ACCOUNT_KEY? [k/e] " VASTAUS
[ "$VASTAUS" = "k" ] || { echo "Peruttu, mitään ei muutettu."; exit 0; }

# Poisto saa epäonnistua: muuttujaa ei välttämättä ole.
npx vercel@latest env rm GOOGLE_SERVICE_ACCOUNT_KEY development --yes 2>/dev/null || true

printf '%s' "$YHDELLA_RIVILLA" | npx vercel@latest env add GOOGLE_SERVICE_ACCOUNT_KEY development
npx vercel@latest env pull .env.local --environment development --yes

# Lainausmerkkien poisto .env.localista — ilman tätä avain on rikki
# paikallisesti vaikka Vercelissä oleva arvo olisi täysin kunnossa.
#
# `vercel env pull` kirjoittaa jokaisen arvon lainausmerkkeihin, ja Next.js:n
# dotenv-lukija laajentaa lainausmerkkien sisällä olevat \n-escapet oikeiksi
# rivinvaihdoiksi. Silloin private_keyhyn tulee raakoja rivinvaihtoja kesken
# JSON-merkkijonon ja JSON.parse kaatuu ("Bad control character in string
# literal"). Ilman lainausmerkkejä dotenv ei laajenna mitään, \n säilyy
# escapena ja JSON purkaa sen itse — mikä on ainoa oikea tapa, koska
# escapejen korvaaminen rikkoo avaimen.
node -e '
  const fs = require("fs")
  const rivit = fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  const i = rivit.findIndex(r => r.startsWith("GOOGLE_SERVICE_ACCOUNT_KEY="))
  if (i < 0) { console.error("Muuttujaa ei ole .env.localissa"); process.exit(1) }
  let v = rivit[i].slice("GOOGLE_SERVICE_ACCOUNT_KEY=".length).trim()
  if (v.startsWith("\"") && v.endsWith("\"")) {
    rivit[i] = "GOOGLE_SERVICE_ACCOUNT_KEY=" + v.slice(1, -1)
    fs.writeFileSync(".env.local", rivit.join("\n"))
    console.log("Lainausmerkit poistettu .env.localista.")
  }
'

# Varmistus: luetaan **täsmälleen niin kuin sovellus lukee** — dotenvin läpi
# ja suoralla JSON.parsella, ei omalla siivouksella. Vanha varmistus riisui
# lainausmerkit itse ja tulosti VARMISTUS OK samalle arvolle jolla sovellus
# kaatui; juuri se "ok": true jonka takana ei tapahtunut mitään.
node -e '
  // @next/env on Next.js:n oma ympäristölataaja — sama koodi joka lataa
  // .env.localin dev-palvelimessa, joten varmistus näkee saman arvon.
  require("@next/env").loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error })
  const raaka = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raaka) { console.error("VARMISTUS EPÄONNISTUI: muuttuja ei latautunut"); process.exit(1) }
  try {
    const key = JSON.parse(raaka)
    if (!String(key.private_key).includes("BEGIN PRIVATE KEY")) throw new Error("private_key ei kelpaa")
    console.log("VARMISTUS OK: " + key.client_email)
  } catch (e) {
    console.error("VARMISTUS EPÄONNISTUI: " + e.message)
    console.error("Jos virhe on \"Bad control character\", .env.localin rivillä on yhä lainausmerkit.")
    process.exit(1)
  }
'
