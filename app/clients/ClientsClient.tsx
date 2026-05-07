'use client'

import { useState } from 'react'

interface Client {
  id: number
  company: string
  contact: string
  email: string
  phone: string
  address: string
  totalInvoiced: number
  outstanding: number
}

const INITIAL_CLIENTS: Client[] = [
  { id: 1, company: 'Baku Tech LLC',    contact: 'Ali Mammadov',    email: 'ali@bakutech.az',      phone: '+994 50 123 4567', address: '12 Nizami St, Baku',          totalInvoiced: 4200,  outstanding: 0     },
  { id: 2, company: 'Caspian Energy',   contact: 'Leyla Hasanova',  email: 'leyla@caspian.az',     phone: '+994 55 234 5678', address: '45 Istiqlaliyyat Ave, Baku',  totalInvoiced: 7800,  outstanding: 0     },
  { id: 3, company: 'Atlas Group',      contact: 'Farid Aliyev',    email: 'farid@atlas.az',       phone: '+994 70 345 6789', address: '8 Rashid Behbudov St, Baku',  totalInvoiced: 3500,  outstanding: 3500  },
  { id: 4, company: 'Silk Road Hotels', contact: 'Nigar Rzayeva',   email: 'nigar@silkroad.az',    phone: '+994 51 456 7890', address: '20 Neftchilar Ave, Baku',     totalInvoiced: 9200,  outstanding: 9200  },
  { id: 5, company: 'Azerenerji',       contact: 'Tural Ismayilov', email: 'tural@azerenerji.az',  phone: '+994 55 567 8901', address: '73 Hasan Aliyev St, Baku',    totalInvoiced: 1850,  outstanding: 1850  },
  { id: 6, company: 'Socar Trading',    contact: 'Elchin Quliyev',  email: 'elchin@socar.az',      phone: '+994 70 678 9012', address: 'SOCAR Tower, Baku',           totalInvoiced: 12400, outstanding: 0     },
  { id: 7, company: 'Kapital Bank',     contact: 'Sevinc Agayeva',  email: 'sevinc@kapital.az',    phone: '+994 50 789 0123', address: '15 Landau St, Baku',          totalInvoiced: 2500,  outstanding: 0     },
]

const EMPTY_FORM = { company: '', contact: '', email: '', phone: '', address: '' }
type FormData = typeof EMPTY_FORM

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ClientsClient() {
  const [clients, setClients]         = useState<Client[]>(INITIAL_CLIENTS)
  const [showModal, setShowModal]     = useState(false)
  const [editingId, setEditingId]     = useState<number | null>(null)
  const [form, setForm]               = useState<FormData>(EMPTY_FORM)

  const isEditing = editingId !== null

  function setField(key: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }))
  }

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  function openEdit(client: Client) {
    setEditingId(client.id)
    setForm({
      company: client.company,
      contact: client.contact,
      email:   client.email,
      phone:   client.phone,
      address: client.address,
    })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isEditing) {
      setClients(prev =>
        prev.map(c => c.id === editingId ? { ...c, ...form } : c)
      )
    } else {
      setClients(prev => [...prev, {
        id:            Date.now(),
        ...form,
        totalInvoiced: 0,
        outstanding:   0,
      }])
    }
    closeModal()
  }

  const totalInvoiced   = clients.reduce((s, c) => s + c.totalInvoiced, 0)
  const totalOutstanding = clients.reduce((s, c) => s + c.outstanding, 0)

  return (
    <div>

      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Clients</h2>
          <p className="text-gray-500 text-sm mt-1">
            {clients.length} client{clients.length !== 1 ? 's' : ''} &mdash;{' '}
            <span className="font-semibold text-gray-700">{fmt(totalInvoiced)}</span> invoiced,{' '}
            <span className={`font-semibold ${totalOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {fmt(totalOutstanding)}
            </span>{' '}
            outstanding
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Client
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Client Name', 'Email', 'Phone', 'Total Invoiced', 'Outstanding', ''].map(h => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3 last:w-20"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map(client => (
                <tr key={client.id} className="hover:bg-slate-50 transition-colors group">

                  {/* Client name + contact person */}
                  <td className="px-6 py-4">
                    <p className="text-sm font-semibold text-gray-900">{client.company}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{client.contact}</p>
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-600">
                    <a href={`mailto:${client.email}`} className="hover:text-blue-600 transition-colors">
                      {client.email}
                    </a>
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                    {client.phone}
                  </td>

                  <td className="px-6 py-4 text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                    {fmt(client.totalInvoiced)}
                  </td>

                  <td className="px-6 py-4 tabular-nums whitespace-nowrap">
                    {client.outstanding === 0 ? (
                      <span className="text-sm font-semibold text-green-600">{fmt(0)}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        {fmt(client.outstanding)}
                      </span>
                    )}
                  </td>

                  {/* Edit button */}
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => openEdit(client)}
                      title="Edit client"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-blue-200 opacity-0 group-hover:opacity-100"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Totals footer */}
            {clients.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={3} className="px-6 py-3 text-sm font-semibold text-gray-600">
                    Total
                  </td>
                  <td className="px-6 py-3 text-sm font-bold text-gray-900 tabular-nums">
                    {fmt(totalInvoiced)}
                  </td>
                  <td className={`px-6 py-3 text-sm font-bold tabular-nums ${totalOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {fmt(totalOutstanding)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {clients.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">
            No clients yet. Click <strong>Add Client</strong> to create one.
          </div>
        )}
      </div>

      {/* ── Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {isEditing ? 'Edit Client' : 'Add Client'}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isEditing ? 'Update the client details below' : 'Fill in the client details below'}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 space-y-4">

                {/* Company name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Company Name
                  </label>
                  <input
                    type="text"
                    required
                    value={form.company}
                    onChange={setField('company')}
                    placeholder="e.g. Baku Tech LLC"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                {/* Contact person */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    required
                    value={form.contact}
                    onChange={setField('contact')}
                    placeholder="e.g. Ali Mammadov"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                {/* Email + Phone side by side */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={setField('email')}
                      placeholder="email@company.az"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                    <input
                      type="tel"
                      required
                      value={form.phone}
                      onChange={setField('phone')}
                      placeholder="+994 50 000 0000"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
                  <textarea
                    value={form.address}
                    onChange={setField('address')}
                    placeholder="Street, City"
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                  />
                </div>

              </div>

              {/* Form footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 active:bg-green-800 rounded-lg transition-colors shadow-sm"
                >
                  {isEditing ? 'Save Changes' : 'Add Client'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  )
}
