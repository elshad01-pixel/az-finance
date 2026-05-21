import { Suspense } from 'react'
import BatchesClient from './BatchesClient'

export default function BatchesPage() {
  return <Suspense><BatchesClient /></Suspense>
}
