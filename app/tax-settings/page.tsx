import TaxSettingsClient from './TaxSettingsClient'

export default function TaxSettingsPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Tax Settings</h2>
        <p className="text-gray-500 text-sm mt-1">
          Configure your tax regime, VAT status, and payroll settings to enable accurate tax
          calculations and deadline reminders.
        </p>
      </div>
      <TaxSettingsClient />
    </div>
  )
}
