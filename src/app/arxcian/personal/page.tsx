import { SectionPlaceholder } from '@/components/arxcian/SectionPlaceholder'

export const metadata = { title: 'Personal · arxcian' }

export default function PersonalPage() {
  return (
    <SectionPlaceholder
      id="personal"
      title="Personal"
      description="Kalenteri, tavoitteet ja rutiinit"
      vaihe={3}
      tulossa={[
        'Google Calendar -synkronointi: päivä-, viikko-, kuukausi- ja vuosinäkymät',
        'Tavoitteet elämänalueittain: työ, henkilökohtainen, terveys',
        'Habit tracker päivittäisille rutiineille, streak-seuranta erillään tavoitteista',
        'Muistiinpanot ja inbox nopealla kirjauksella ja tageilla',
        'Viikko- ja kuukausikatsaus-pohja reflektointiin',
        'Personal Growth -kirjasto ja kieltenoppiminen (vaiheet 4–5)',
      ]}
    />
  )
}
