import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { google } from 'googleapis'
import crypto from 'crypto'
import { authorizeCron } from '@/lib/arxcian/cron'

const WEBHOOK_ADDRESS = 'https://rjmob-portal.vercel.app/api/webhook/drive'

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

// Rekisteröi yhden Drive Changes API -watch-kanavan (ei erikseen per kansio): palvelutili näkee
// vain sille jaetut kansiot (Myyntiseurannat + Maksukuitit), joten changes.watch kattaa
// käytännössä juuri nämä kaksi kansiota koko Driven sijaan. Tämä on tarkoituksella eri
// mekanismi kuin files.watch(kansioId) — kansion oman resurssin watch ei Google Drive API:n
// dokumentoidun käytöksen mukaan laukea kun kansiossa jo olevaa tiedostoa muokataan (esim.
// solun arvo vaihtuu), vain kun kansioon lisätään/siitä poistetaan/sitä nimetään uudelleen.
// changes.watch taas laukeaa myös olemassa olevan tiedoston sisällön muuttuessa, mikä on
// yleisin todellinen käyttötapaus tässä (maksukuitin/myyntiseurannan solujen päivitys).
async function registerWatch() {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  const startTokenRes = await drive.changes.getStartPageToken({})
  const pageToken = startTokenRes.data.startPageToken
  if (!pageToken) throw new Error('Drive ei palauttanut startPageTokenia')

  const channelId = crypto.randomUUID()
  // Google hyväksyy watch-pyynnön mutta saattaa itse lyhentää vanhenemisajan omaan
  // maksimiinsa (tyypillisesti ~7 vrk) — pyydetään 7 vrk, ja varmistetaan tuoreus joka
  // tapauksessa päivittäisellä Vercel Cron -uusinnalla (ks. vercel.json).
  const expiration = String(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const watchRes = await drive.changes.watch({
    pageToken,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: WEBHOOK_ADDRESS,
      token: process.env.DRIVE_WEBHOOK_TOKEN,
      expiration,
    },
  })

  return {
    channelId,
    resourceId: watchRes.data.resourceId,
    expiration: watchRes.data.expiration,
    address: WEBHOOK_ADDRESS,
  }
}

// Kutsutaan manuaalisesti kerran deployn jälkeen (https://rjmob-portal.vercel.app/api/webhook/register)
// ja automaattisesti Vercel Cron Jobilla kerran päivässä (ks. vercel.json) watch-kanavan
// tuoreuden varmistamiseksi. Kutsu vaatii nyt CRON_SECRETin Authorization-otsakkeessa
// (Vercel Cron lähettää sen automaattisesti) tai kirjautuneen istunnon — sama mekanismi
// kuin /api/arxcian/cronissa. Middleware päästää reitin läpi, joten todennus tehdään tässä.
export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeCron(req)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Ei oikeutta' }, { status: 401 })
    }

    // Vasta todennuksen jälkeen: todentamaton kutsuja ei saa tietoa siitä,
    // mitä ympäristömuuttujia palvelimelta puuttuu.
    if (!process.env.DRIVE_WEBHOOK_TOKEN) {
      return NextResponse.json({ error: 'DRIVE_WEBHOOK_TOKEN puuttuu ympäristömuuttujista' }, { status: 500 })
    }
    const result = await registerWatch()
    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
