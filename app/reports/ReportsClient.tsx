'use client'

import { useState } from 'react'

interface ReportCard {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  iconBg: string
}

const REPORT_CARDS: ReportCard[] = [
  {
    id: 'revenue',
    title: 'Monthly Revenue Report',
    description: 'Detailed breakdown of all revenue streams, invoices, and payments received within the selected period.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    iconBg: 'bg-blue-100 text-blue-600',
  },
  {
    id: 'expense',
    title: 'Expense Summary',
    description: 'Complete overview of all business expenses categorized by type, vendor, and department for the selected period.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    iconBg: 'bg-red-100 text-red-600',
  },
  {
    id: 'tax',
    title: 'Tax Report',
    description: 'Summary of taxable income, VAT collected, deductible expenses, and net tax liability for the selected period.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
      </svg>
    ),
    iconBg: 'bg-amber-100 text-amber-600',
  },
]

const MONTHLY_DATA = [
  { month: 'Nov 2025', revenue: 89200,  expenses: 32100, profit: 57100  },
  { month: 'Dec 2025', revenue: 95400,  expenses: 38500, profit: 56900  },
  { month: 'Jan 2026', revenue: 102300, expenses: 35800, profit: 66500  },
  { month: 'Feb 2026', revenue: 98700,  expenses: 33200, profit: 65500  },
  { month: 'Mar 2026', revenue: 110100, expenses: 39600, profit: 70500  },
  { month: 'Apr 2026', revenue: 115800, expenses: 41200, profit: 74600  },
]

function fmt(n: number) {
  return `₼ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ReportsClient() {
  const [dates, setDates] = useState<Record<string, { from: string; to: string }>>({
    revenue: { from: '2026-04-01', to: '2026-04-30' },
    expense: { from: '2026-04-01', to: '2026-04-30' },
    tax:     { from: '2026-04-01', to: '2026-04-30' },
  })
  const [generated, setGenerated] = useState<string | null>(null)

  function handleDateChange(id: string, field: 'from' | 'to', value: string) {
    setDates(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  function handleGenerate(id: string) {
    setGenerated(id)
    setTimeout(() => setGenerated(null), 2000)
  }

  const totalRevenue  = MONTHLY_DATA.reduce((s, r) => s + r.revenue, 0)
  const totalExpenses = MONTHLY_DATA.reduce((s, r) => s + r.expenses, 0)
  const totalProfit   = MONTHLY_DATA.reduce((s, r) => s + r.profit, 0)

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Reports</h2>
        <p className="text-gray-500 text-sm mt-1">
          Generate financial reports and review monthly performance summaries.
        </p>
      </div>

      {/* Report cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        {REPORT_CARDS.map((card) => {
          const d = dates[card.id]
          const isGenerating = generated === card.id
          return (
            <div
              key={card.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
            >
              {/* Card header */}
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg}`}>
                  {card.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{card.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{card.description}</p>
                </div>
              </div>

              {/* Date range */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                    <input
                      type="date"
                      value={d.from}
                      onChange={e => handleDateChange(card.id, 'from', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                    <input
                      type="date"
                      value={d.to}
                      onChange={e => handleDateChange(card.id, 'to', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                </div>
              </div>

              {/* Generate button */}
              <button
                onClick={() => handleGenerate(card.id)}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                {isGenerating ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Generating…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Generate Report
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Monthly summary table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Monthly Financial Summary</h3>
          <p className="text-xs text-gray-400 mt-0.5">Last 6 months &mdash; Revenue, Expenses &amp; Net Profit in AZN</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Month', 'Revenue (AZN)', 'Expenses (AZN)', 'Net Profit (AZN)'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {MONTHLY_DATA.map((row) => (
                <tr key={row.month} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{row.month}</td>
                  <td className="px-6 py-4 text-sm text-blue-700 font-semibold tabular-nums">{fmt(row.revenue)}</td>
                  <td className="px-6 py-4 text-sm text-red-600 font-semibold tabular-nums">{fmt(row.expenses)}</td>
                  <td className="px-6 py-4 text-sm tabular-nums">
                    <span className={`font-semibold ${row.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmt(row.profit)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-6 py-3 text-sm font-semibold text-gray-600">Total</td>
                <td className="px-6 py-3 text-sm font-bold text-blue-700 tabular-nums">{fmt(totalRevenue)}</td>
                <td className="px-6 py-3 text-sm font-bold text-red-600 tabular-nums">{fmt(totalExpenses)}</td>
                <td className="px-6 py-3 text-sm font-bold text-green-600 tabular-nums">{fmt(totalProfit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
