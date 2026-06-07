import { Resend } from 'resend'

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY not configured')
  return new Resend(key)
}

function getFrom(): string {
  return process.env.EMAIL_FROM ?? 'AzFinance <onboarding@resend.dev>'
}

function template(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="az">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:#1e3a8a;padding:28px 40px;">
          <span style="font-size:26px;font-weight:700;color:#ffffff;">Az</span><span style="font-size:26px;font-weight:700;color:#93c5fd;">Finance</span>
          <p style="margin:4px 0 0;font-size:11px;color:#93c5fd;">Financial Management Platform</p>
        </td></tr>
        <tr><td style="padding:36px 40px;">${body}</td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">© ${new Date().getFullYear()} AzFinance · Financial Management Platform</p>
          <p style="margin:4px 0 0;font-size:10px;color:#cbd5e1;">Bu e-poçt avtomatik göndərilmişdir / This email was sent automatically</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export interface SendResult {
  ok:     boolean
  error?: string
  id?:    string
}

// ── 1. Invoice ─────────────────────────────────────────────────────────────

export async function sendInvoiceEmail(
  to:         string,
  data:       { invoiceNumber: string; clientName: string; amount: string; dueDate: string; companyName: string },
  pdfBase64?: string,
): Promise<SendResult> {
  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Faktura / Invoice</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;">
      Hörmətli <strong>${data.clientName}</strong> / Dear <strong>${data.clientName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;">
      Aşağıdakı faktura sizin üçün hazırlanmışdır. Zəhmət olmasa son ödəniş tarixinə qədər ödənişi tamamlayın.<br>
      <em style="color:#94a3b8;">Your invoice is ready. Please complete payment by the due date.</em>
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:20px;margin:0 0 24px;">
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#64748b;">Faktura No / Invoice #</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;color:#1e293b;text-align:right;">${data.invoiceNumber}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#64748b;">Şirkət / Company</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;color:#1e293b;text-align:right;">${data.companyName}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#64748b;">Son Tarix / Due Date</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;color:#dc2626;text-align:right;">${data.dueDate}</td>
      </tr>
      <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding-top:10px;"></td></tr>
      <tr>
        <td style="padding:4px 0;font-size:15px;font-weight:700;color:#1e293b;">Ümumi Məbləğ / Total</td>
        <td style="padding:4px 0;font-size:18px;font-weight:700;color:#1e3a8a;text-align:right;">${data.amount}</td>
      </tr>
    </table>
    ${pdfBase64 ? '<p style="margin:0;font-size:12px;color:#94a3b8;">PDF faktura əlavə olunub. / PDF invoice is attached.</p>' : ''}
  `

  const { data: res, error } = await getResend().emails.send({
    from:    getFrom(),
    to,
    subject: `[AzFinance] Faktura ${data.invoiceNumber} — ${data.amount} / Invoice ${data.invoiceNumber}`,
    html:    template(`Faktura ${data.invoiceNumber}`, body),
    ...(pdfBase64 ? { attachments: [{ filename: `${data.invoiceNumber}.pdf`, content: pdfBase64 }] } : {}),
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: res?.id }
}

// ── 2. Invite ──────────────────────────────────────────────────────────────

export async function sendInviteEmail(
  to:   string,
  data: { inviteUrl: string; inviterName: string; companyName: string; role: string },
): Promise<SendResult> {
  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Komandaya Dəvət / Team Invitation</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#334155;">
      <strong>${data.inviterName}</strong> sizi <strong>${data.companyName}</strong> şirkətinin AzFinance ERP sisteminə dəvət edir.<br>
      <em style="color:#94a3b8;">${data.inviterName} has invited you to join <strong>${data.companyName}</strong> on AzFinance ERP.</em>
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <tr><td style="font-size:13px;color:#0369a1;">Rol / Role: <strong style="text-transform:capitalize;">${data.role}</strong></td></tr>
    </table>
    <p style="text-align:center;margin:0 0 24px;">
      <a href="${data.inviteUrl}"
         style="display:inline-block;background:#2563eb;color:#ffffff;font-size:14px;font-weight:600;padding:13px 32px;border-radius:8px;text-decoration:none;">
        Dəvəti Qəbul Et / Accept Invitation
      </a>
    </p>
    <p style="margin:0;font-size:12px;color:#94a3b8;">Bu link yalnız bir dəfə istifadə oluna bilər. / This link can only be used once.</p>
  `

  const { data: res, error } = await getResend().emails.send({
    from:    getFrom(),
    to,
    subject: `[AzFinance] ${data.companyName} — Komandaya Dəvət / Team Invitation`,
    html:    template('Komandaya Dəvət / Team Invitation', body),
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: res?.id }
}

// ── 3. Payslip ─────────────────────────────────────────────────────────────

export async function sendPayslipEmail(
  to:        string,
  data:      { employeeName: string; monthName: string; year: number; netSalary: string; companyName: string },
  pdfBase64: string,
): Promise<SendResult> {
  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Maaş Vərəqəsi / Payslip</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;">
      Hörmətli <strong>${data.employeeName}</strong>,<br>
      <em style="color:#94a3b8;">Dear ${data.employeeName},</em>
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;">
      <strong>${data.monthName} ${data.year}</strong> dövrü üçün maaş vərəqəniz hazırdır.<br>
      <em style="color:#94a3b8;">Your payslip for <strong>${data.monthName} ${data.year}</strong> is attached.</em>
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;padding:20px;margin:0 0 24px;">
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748b;">Şirkət / Company</td>
        <td style="padding:4px 0;font-size:13px;font-weight:600;color:#1e293b;text-align:right;">${data.companyName}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748b;">Dövr / Period</td>
        <td style="padding:4px 0;font-size:13px;font-weight:600;color:#1e293b;text-align:right;">${data.monthName} ${data.year}</td>
      </tr>
      <tr><td colspan="2" style="border-top:1px solid #bbf7d0;padding-top:10px;"></td></tr>
      <tr>
        <td style="font-size:15px;font-weight:700;color:#1e293b;">Xalis Maaş / Net Salary</td>
        <td style="font-size:18px;font-weight:700;color:#16a34a;text-align:right;">${data.netSalary}</td>
      </tr>
    </table>
    <p style="margin:0;font-size:12px;color:#94a3b8;">Ətraflı məlumat üçün PDF vərəqəyə baxın. / See the PDF for full details.</p>
  `

  const { data: res, error } = await getResend().emails.send({
    from:    getFrom(),
    to,
    subject: `[AzFinance] Maaş Vərəqəsi — ${data.monthName} ${data.year} / Payslip`,
    html:    template('Maaş Vərəqəsi / Payslip', body),
    attachments: [{
      filename: `payslip_${data.employeeName.replace(/\s+/g, '_')}_${data.year}_${data.monthName}.pdf`,
      content:  pdfBase64,
    }],
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: res?.id }
}

// ── 4. Audit report ────────────────────────────────────────────────────────

export async function sendAuditReport(
  to:        string,
  data:      { runId: string; score: string; grade: string; phase: string },
  pdfBase64: string,
): Promise<SendResult> {
  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Aytaç ERP Audit Hesabatı</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;">
      <strong>Auditor:</strong> Aytaç — Baş ERP Auditor, Azərbaycan Mühasibatlığı Mütəxəssisi<br>
      <em style="color:#94a3b8;">Your AzFinance ERP audit report is ready.</em>
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:8px;padding:20px;margin:0 0 24px;">
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748b;">Phase</td>
        <td style="padding:4px 0;font-size:13px;font-weight:600;color:#1e293b;text-align:right;">${data.phase}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748b;">Run ID</td>
        <td style="padding:4px 0;font-size:11px;color:#64748b;text-align:right;">${data.runId}</td>
      </tr>
      <tr><td colspan="2" style="border-top:1px solid #bfdbfe;padding-top:10px;"></td></tr>
      <tr>
        <td style="font-size:15px;font-weight:700;color:#1e293b;">Score</td>
        <td style="font-size:18px;font-weight:700;color:#1e3a8a;text-align:right;">${data.score} (${data.grade})</td>
      </tr>
    </table>
    <p style="margin:0;font-size:12px;color:#94a3b8;">PDF hesabat əlavə olunub. / Full PDF report is attached.</p>
  `

  const { data: res, error } = await getResend().emails.send({
    from:    getFrom(),
    to,
    subject: `[AzFinance] Aytaç Audit Hesabatı — ${data.score} (${data.grade})`,
    html:    template('Audit Hesabatı', body),
    attachments: [{ filename: 'aytac-audit-report.pdf', content: pdfBase64 }],
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: res?.id }
}

// ── 5. Vendor portal invite ────────────────────────────────────────────────

export async function sendVendorInviteEmail(
  to:   string,
  data: { vendorName: string; companyName: string; portalUrl: string },
): Promise<SendResult> {
  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Vendor Portal Invitation</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;">
      Dear <strong>${data.vendorName}</strong>,<br><br>
      <strong>${data.companyName}</strong> has invited you to access their Vendor Portal on AzFinance.
      You can now view your purchase orders, submit invoices, and track payment status online.
    </p>
    <p style="text-align:center;margin:0 0 24px;">
      <a href="${data.portalUrl}"
         style="display:inline-block;background:#0f766e;color:#ffffff;font-size:14px;font-weight:600;padding:13px 32px;border-radius:8px;text-decoration:none;">
        Access Vendor Portal
      </a>
    </p>
    <p style="margin:0;font-size:12px;color:#94a3b8;">
      If you don't have an account yet, you can sign up at the portal link above using this email address.
    </p>
  `
  const { data: res, error } = await getResend().emails.send({
    from:    getFrom(),
    to,
    subject: `${data.companyName} — You've been invited to the Vendor Portal`,
    html:    template('Vendor Portal Invitation', body),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: res?.id }
}

// ── 6. Vendor invoice submitted (to company) ───────────────────────────────

export async function sendVendorInvoiceSubmitted(
  to:   string,
  data: { vendorName: string; invoiceNumber: string; amount: string; poNumber: string },
): Promise<SendResult> {
  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">New Vendor Invoice Received</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;">
      <strong>${data.vendorName}</strong> has submitted a new invoice for your review.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:20px;margin:0 0 24px;">
      <tr><td style="padding:4px 0;font-size:13px;color:#64748b;">Invoice #</td>
          <td style="padding:4px 0;font-size:13px;font-weight:600;color:#1e293b;text-align:right;">${data.invoiceNumber}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#64748b;">PO #</td>
          <td style="padding:4px 0;font-size:13px;font-weight:600;color:#1e293b;text-align:right;">${data.poNumber}</td></tr>
      <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding-top:10px;"></td></tr>
      <tr><td style="font-size:15px;font-weight:700;color:#1e293b;">Amount</td>
          <td style="font-size:18px;font-weight:700;color:#1e3a8a;text-align:right;">${data.amount}</td></tr>
    </table>
    <p style="margin:0;font-size:12px;color:#94a3b8;">Review this invoice in AzFinance under Procurement → Vendor Invoices.</p>
  `
  const { data: res, error } = await getResend().emails.send({
    from:    getFrom(),
    to,
    subject: `[AzFinance] New vendor invoice from ${data.vendorName} — ${data.invoiceNumber}`,
    html:    template('New Vendor Invoice', body),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: res?.id }
}

// ── 7. Vendor invoice approved (to vendor) ─────────────────────────────────

export async function sendVendorInvoiceApproved(
  to:   string,
  data: { invoiceNumber: string; companyName: string },
): Promise<SendResult> {
  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Invoice Approved ✓</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;">
      Your invoice <strong>${data.invoiceNumber}</strong> has been approved by <strong>${data.companyName}</strong>.
      Payment will be processed according to your agreed payment terms.
    </p>
    <p style="margin:0;font-size:12px;color:#94a3b8;">Log in to the Vendor Portal to check your invoice status.</p>
  `
  const { data: res, error } = await getResend().emails.send({
    from:    getFrom(),
    to,
    subject: `[AzFinance] Your invoice ${data.invoiceNumber} has been approved`,
    html:    template('Invoice Approved', body),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: res?.id }
}

// ── 8. Vendor invoice rejected (to vendor) ─────────────────────────────────

export async function sendVendorInvoiceRejected(
  to:   string,
  data: { invoiceNumber: string; companyName: string; reason: string },
): Promise<SendResult> {
  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Invoice Needs Attention</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;">
      Your invoice <strong>${data.invoiceNumber}</strong> submitted to <strong>${data.companyName}</strong> could not be approved.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;padding:16px 20px;margin:0 0 24px;border:1px solid #fecaca;">
      <tr><td style="font-size:13px;font-weight:600;color:#991b1b;margin-bottom:4px;">Reason:</td></tr>
      <tr><td style="font-size:13px;color:#7f1d1d;padding-top:4px;">${data.reason}</td></tr>
    </table>
    <p style="margin:0;font-size:12px;color:#94a3b8;">Please log in to the Vendor Portal to resubmit a corrected invoice.</p>
  `
  const { data: res, error } = await getResend().emails.send({
    from:    getFrom(),
    to,
    subject: `[AzFinance] Your invoice ${data.invoiceNumber} needs attention`,
    html:    template('Invoice Rejected', body),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: res?.id }
}

// ── 9. Vendor payment confirmed (to vendor) ────────────────────────────────

export async function sendVendorPaymentConfirmed(
  to:   string,
  data: { invoiceNumber: string; amount: string; companyName: string },
): Promise<SendResult> {
  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Payment Confirmed ✓</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;">
      <strong>${data.companyName}</strong> has marked your invoice <strong>${data.invoiceNumber}</strong> as paid.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;padding:20px;margin:0 0 24px;">
      <tr><td style="font-size:15px;font-weight:700;color:#1e293b;">Amount Paid</td>
          <td style="font-size:18px;font-weight:700;color:#16a34a;text-align:right;">${data.amount}</td></tr>
    </table>
    <p style="margin:0;font-size:12px;color:#94a3b8;">Thank you for doing business with ${data.companyName}.</p>
  `
  const { data: res, error } = await getResend().emails.send({
    from:    getFrom(),
    to,
    subject: `[AzFinance] Payment confirmed for invoice ${data.invoiceNumber}`,
    html:    template('Payment Confirmed', body),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: res?.id }
}

// ── 10. Tax reminder ────────────────────────────────────────────────────────

export async function sendTaxReminder(
  to:   string,
  data: { taxType: string; deadline: string; companyName: string; amount?: string },
): Promise<SendResult> {
  const body = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">Vergi Xatırlatması / Tax Reminder</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;">
      <strong>${data.companyName}</strong> üçün vergi ödəniş tarixi yaxınlaşır.<br>
      <em style="color:#94a3b8;">Tax payment deadline is approaching for ${data.companyName}.</em>
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border-radius:8px;padding:20px;margin:0 0 24px;border:1px solid #fde68a;">
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748b;">Vergi Növü / Tax Type</td>
        <td style="padding:4px 0;font-size:13px;font-weight:600;color:#1e293b;text-align:right;">${data.taxType}</td>
      </tr>
      ${data.amount ? `
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748b;">Məbləğ / Amount</td>
        <td style="padding:4px 0;font-size:13px;font-weight:600;color:#1e293b;text-align:right;">${data.amount}</td>
      </tr>` : ''}
      <tr><td colspan="2" style="border-top:1px solid #fde68a;padding-top:10px;"></td></tr>
      <tr>
        <td style="font-size:15px;font-weight:700;color:#1e293b;">Son Tarix / Deadline</td>
        <td style="font-size:18px;font-weight:700;color:#d97706;text-align:right;">${data.deadline}</td>
      </tr>
    </table>
    <p style="margin:0;font-size:12px;color:#94a3b8;">AzFinance · Azərbaycan Vergi Məcəlləsinə uyğun xatırlatma sistemi.</p>
  `

  const { data: res, error } = await getResend().emails.send({
    from:    getFrom(),
    to,
    subject: `[AzFinance] Vergi Xatırlatması: ${data.taxType} — ${data.deadline}`,
    html:    template('Vergi Xatırlatması', body),
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: res?.id }
}
