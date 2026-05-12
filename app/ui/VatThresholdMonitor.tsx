'use client'

const THRESHOLD = 200_000

function fmtK(n: number) {
  return `₼${Math.round(n).toLocaleString('en-US')}`
}

interface Props {
  annualRevenue: number
}

export default function VatThresholdMonitor({ annualRevenue }: Props) {
  const pct = Math.min((annualRevenue / THRESHOLD) * 100, 100)

  const isCritical = annualRevenue > 200_000
  const isUrgent   = annualRevenue > 190_000
  const isWarning  = annualRevenue > 160_000

  const barColor = isCritical
    ? 'bg-red-500'
    : isUrgent
    ? 'bg-orange-500'
    : isWarning
    ? 'bg-yellow-400'
    : 'bg-emerald-500'

  const valueColor = isCritical
    ? 'text-red-600'
    : isUrgent
    ? 'text-orange-600'
    : isWarning
    ? 'text-yellow-600'
    : 'text-gray-700'

  type Alert = { border: string; bg: string; text: string; iconColor: string; msg: string; icon: 'critical' | 'urgent' | 'warn' }
  const alert: Alert | null = isCritical
    ? { border: 'border-red-300',    bg: 'bg-red-50',    text: 'text-red-800',    iconColor: 'text-red-500',    icon: 'critical',
        msg: 'Kritik: İllik gəliriniz ₼200,000 həddini keçib. Dərhal ƏDV qeydiyyatından keçməlisiniz!' }
    : isUrgent
    ? { border: 'border-orange-300', bg: 'bg-orange-50', text: 'text-orange-800', iconColor: 'text-orange-500', icon: 'urgent',
        msg: 'Təcili: İllik gəliriniz ₼190,000-i keçib. ƏDV qeydiyyatı tezliklə məcburi olacaq.' }
    : isWarning
    ? { border: 'border-yellow-300', bg: 'bg-yellow-50', text: 'text-yellow-800', iconColor: 'text-yellow-500', icon: 'warn',
        msg: 'Diqqət: İllik gəliriniz ₼160,000 həddini keçib. ƏDV qeydiyyatı həddine yaxınlaşırsınız.' }
    : null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">ƏDV Hədd Monitoru</p>
          <p className="text-xs text-gray-400 mt-0.5">Son 12 ay · Ödənilmiş fakturalar</p>
        </div>
        <span className={`text-sm font-bold tabular-nums ${valueColor}`}>
          {fmtK(annualRevenue)} <span className="text-gray-400 font-normal">/ {fmtK(THRESHOLD)}</span>
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
        {/* Threshold tick marks */}
        <div className="absolute inset-y-0 left-[80%] w-px bg-yellow-400 opacity-60" />
        <div className="absolute inset-y-0 left-[95%] w-px bg-orange-400 opacity-60" />
      </div>

      {/* Scale labels */}
      <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
        <span>{pct.toFixed(1)}%</span>
        <span className="text-yellow-500">₼160k</span>
        <span className="text-orange-500">₼190k</span>
        <span>₼200,000</span>
      </div>

      {/* Alert banner */}
      {alert && (
        <div className={`mt-3 flex items-start gap-2.5 border rounded-lg px-3 py-2.5 ${alert.bg} ${alert.border}`}>
          <svg className={`w-4 h-4 shrink-0 mt-0.5 ${alert.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {alert.icon === 'critical' ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            )}
          </svg>
          <p className={`text-xs font-medium leading-snug ${alert.text}`}>{alert.msg}</p>
        </div>
      )}
    </div>
  )
}
