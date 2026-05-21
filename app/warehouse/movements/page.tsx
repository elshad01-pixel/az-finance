import { Suspense } from 'react'
import MovementsClient from './MovementsClient'

export default function MovementsPage() {
  return <Suspense><MovementsClient /></Suspense>
}
