import { Suspense } from 'react'
import SalesOrdersClient from './SalesOrdersClient'

export default function SalesOrdersPage() {
  return <Suspense><SalesOrdersClient /></Suspense>
}
