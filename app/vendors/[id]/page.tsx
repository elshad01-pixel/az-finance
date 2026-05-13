import VendorDetailClient from './VendorDetailClient'

export default async function VendorDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  return <VendorDetailClient vendorId={parseInt(id, 10)} />
}
