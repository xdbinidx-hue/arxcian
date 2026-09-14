import { notFound } from 'next/navigation'
import { currentUser } from '@/lib/session'
import { ChecklistPanel } from './panel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Käyttötestilista · arxcian' }
export default async function Page() {
  if (await currentUser() !== 'albin' || process.env.ARXCIAN_CHECKLIST_ENABLED !== 'true') notFound()
  return <ChecklistPanel />
}
