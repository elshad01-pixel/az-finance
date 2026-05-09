import CompanySettingsClient from './CompanySettingsClient'

export default function CompanySettingsPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Company Settings</h2>
        <p className="text-gray-500 text-sm mt-1">
          Your company details appear on invoice PDFs sent to clients.
        </p>
      </div>
      <CompanySettingsClient />
    </div>
  )
}
