import { SectionPlaceholder } from '@/components/arxcian/SectionPlaceholder'

export const metadata = { title: 'Uutiset · arxcian' }

export default function UutisetPage() {
  return (
    <SectionPlaceholder
      id="uutiset"
      title="Uutiset"
      description="Kategorioidut koosteet ja AI-tiivistelmät"
      vaihe={1}
      tulossa={[
        'Kategoriat: Bisnes, AI, Sijoittaminen, Terveys, Teknologia, Historia',
        'RSS-lähteet kategorioittain, 2–3 luotettavaa lähdettä kussakin',
        'Mark Mossin YouTube-kanava omana lähteenään',
        'AI-tiivistelmä ja linkki alkuperäiseen jokaisesta uutisesta',
        'Koosteet neljästi päivässä: 08:00, 12:00, 16:00, 20:00',
        'Tägijaottelu aiheittain ja "lue myöhemmin" -lista',
        'Sää-widget ja säkarttanäkymä',
      ]}
    />
  )
}
