export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  sendInvoiceEmail,
  sendInviteEmail,
  sendPayslipEmail,
  sendAuditReport,
  sendTaxReminder,
  sendVendorInviteEmail,
  sendVendorInvoiceSubmitted,
  sendVendorInvoiceApproved,
  sendVendorInvoiceRejected,
  sendVendorPaymentConfirmed,
} from '@/lib/email'

export async function POST(req: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { type, to, data, attachmentBase64 } = body as {
    type:            string
    to:              string
    data:            Record<string, string>
    attachmentBase64?: string
  }

  if (!type || !to) {
    return NextResponse.json({ ok: false, error: 'Missing type or to' }, { status: 400 })
  }

  try {
    let result

    switch (type) {
      case 'invoice':
        result = await sendInvoiceEmail(to, data as Parameters<typeof sendInvoiceEmail>[1], attachmentBase64)
        break
      case 'invite':
        result = await sendInviteEmail(to, data as Parameters<typeof sendInviteEmail>[1])
        break
      case 'payslip':
        if (!attachmentBase64) return NextResponse.json({ ok: false, error: 'PDF attachment required' }, { status: 400 })
        result = await sendPayslipEmail(to, data as unknown as Parameters<typeof sendPayslipEmail>[1], attachmentBase64)
        break
      case 'audit':
        if (!attachmentBase64) return NextResponse.json({ ok: false, error: 'PDF attachment required' }, { status: 400 })
        result = await sendAuditReport(to, data as Parameters<typeof sendAuditReport>[1], attachmentBase64)
        break
      case 'tax_reminder':
        result = await sendTaxReminder(to, data as Parameters<typeof sendTaxReminder>[1])
        break
      case 'vendor_invite':
        result = await sendVendorInviteEmail(to, data as Parameters<typeof sendVendorInviteEmail>[1])
        break
      case 'vendor_invoice_submitted':
        result = await sendVendorInvoiceSubmitted(to, data as Parameters<typeof sendVendorInvoiceSubmitted>[1])
        break
      case 'vendor_invoice_approved':
        result = await sendVendorInvoiceApproved(to, data as Parameters<typeof sendVendorInvoiceApproved>[1])
        break
      case 'vendor_invoice_rejected':
        result = await sendVendorInvoiceRejected(to, data as Parameters<typeof sendVendorInvoiceRejected>[1])
        break
      case 'vendor_payment_confirmed':
        result = await sendVendorPaymentConfirmed(to, data as Parameters<typeof sendVendorPaymentConfirmed>[1])
        break
      default:
        return NextResponse.json({ ok: false, error: `Unknown email type: ${type}` }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
