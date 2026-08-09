# arxcian

## Deploy Verceliin (10 minuuttia)

### 1. GitHub-repo

1. Mene github.com → New repository → nimi: `rjmob-portal`
2. Lataa tämä kansio sinne (tai käytä GitHub Desktop)

### 2. Vercel deploy

1. Mene vercel.com → kirjaudu GitHubilla
2. "Add New Project" → valitse `rjmob-portal`
3. Klikkaa "Deploy" — toimii automaattisesti

### 3. Lisää ympäristömuuttuja Verceliin

1. Vercel → Project → Settings → Environment Variables
2. Lisää uusi muuttuja:
   - **Name:** `GOOGLE_SERVICE_ACCOUNT_KEY`
   - **Value:** Koko JSON-tiedoston sisältö YHDELLÄ RIVILLÄ

   Avaa JSON-tiedosto tekstieditorilla, kopioi kaikki sisältö,
   ja liitä se Verceliin yhdelle riville.

3. Klikkaa "Save" ja "Redeploy"

### 4. Valmis!

URL on muotoa: `https://rjmob-portal.vercel.app`

## Päivitys

Kun uusi myyntiseuranta tulee Google Driveen → dashboard päivittyy automaattisesti.
Ei tarvitse tehdä mitään.

## Kehitys lokaalisti

```bash
npm install
# Luo .env.local ja lisää GOOGLE_SERVICE_ACCOUNT_KEY
npm run dev
```
