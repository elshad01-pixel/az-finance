const summaryCards = [
  {
    title: "Total Revenue",
    value: "₼ 124,500",
    badge: "+12.5%",
    badgePositive: true,
    note: "vs last month",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    iconBg: "bg-blue-100 text-blue-600",
  },
  {
    title: "Unpaid Invoices",
    value: "₼ 18,320",
    badge: "7 invoices",
    badgePositive: false,
    note: "awaiting payment",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    iconBg: "bg-amber-100 text-amber-600",
  },
  {
    title: "Total Expenses",
    value: "₼ 43,780",
    badge: "+5.2%",
    badgePositive: false,
    note: "vs last month",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    iconBg: "bg-red-100 text-red-600",
  },
  {
    title: "Net Profit",
    value: "₼ 80,720",
    badge: "+18.3%",
    badgePositive: true,
    note: "vs last month",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    iconBg: "bg-green-100 text-green-600",
  },
];

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
        <p className="text-gray-500 text-sm mt-1">
          Here&apos;s a summary of your financial activity this month.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {summaryCards.map((card) => (
          <div
            key={card.title}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">{card.title}</p>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.iconBg}`}>
                {card.icon}
              </div>
            </div>

            <div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    card.badgePositive
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {card.badge}
                </span>
                <span className="text-xs text-gray-400">{card.note}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue vs Expenses</h3>
          <div className="h-48 flex items-end gap-3 px-2">
            {["Jan", "Feb", "Mar", "Apr", "May"].map((month, i) => {
              const revenueHeights = [60, 75, 55, 85, 100];
              const expenseHeights = [40, 45, 38, 50, 60];
              return (
                <div key={month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end gap-1" style={{ height: "160px" }}>
                    <div
                      className="flex-1 bg-blue-500 rounded-t-sm opacity-80"
                      style={{ height: `${revenueHeights[i]}%` }}
                    />
                    <div
                      className="flex-1 bg-red-400 rounded-t-sm opacity-70"
                      style={{ height: `${expenseHeights[i]}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">{month}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 rounded-sm bg-blue-500 opacity-80 inline-block" />
              Revenue
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 rounded-sm bg-red-400 opacity-70 inline-block" />
              Expenses
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent Activity</h3>
          <ul className="space-y-3">
            {[
              { label: "Invoice #1042 paid", amount: "+₼ 4,200", positive: true, time: "2h ago" },
              { label: "Office supplies", amount: "-₼ 320", positive: false, time: "5h ago" },
              { label: "Invoice #1041 paid", amount: "+₼ 7,800", positive: true, time: "1d ago" },
              { label: "Utility bill", amount: "-₼ 950", positive: false, time: "2d ago" },
              { label: "Invoice #1040 paid", amount: "+₼ 2,500", positive: true, time: "3d ago" },
            ].map((item, i) => (
              <li key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm text-gray-700">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.time}</p>
                </div>
                <span className={`text-sm font-semibold ${item.positive ? "text-green-600" : "text-red-500"}`}>
                  {item.amount}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
