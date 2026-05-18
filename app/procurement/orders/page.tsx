import { Suspense } from 'react'
import OrdersClient from './OrdersClient'
export default function PurchaseOrdersPage() {
  return <Suspense><OrdersClient /></Suspense>
}
