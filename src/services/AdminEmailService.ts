/**
 * AdminEmailService.ts
 *
 * Sends admin moderation emails (Approve / Reject / Suspend / Reactivate)
 * via a SECOND EmailJS account — separate from the main EmailService.ts
 * which handles Forgot Password and Email Verification.
 *
 * ─── Credentials to fill in after setting up the new EmailJS account ─────────
 *   ADMIN_EMAILJS_SERVICE_ID   → Your new EmailJS Service ID
 *   ADMIN_EMAILJS_TEMPLATE_ID  → Your new EmailJS Template ID (template_admin01)
 *   ADMIN_EMAILJS_PUBLIC_KEY   → Your new EmailJS Public Key
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── ⚠️  FILL THESE IN after creating the new EmailJS account ────────────────
const ADMIN_EMAILJS_SERVICE_ID  = 'service_5l1mjw5';   // e.g. 'service_abc12345'
const ADMIN_EMAILJS_TEMPLATE_ID = 'template_admin01';            // must match exactly in EmailJS dashboard
const ADMIN_EMAILJS_PUBLIC_KEY  = '5f-nRcUE5dZp57rYS';   // e.g. 'aBcDeFgH1234567890'
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
//  Internal shared sender — all 4 moderation emails go through this
// ─────────────────────────────────────────────────────────────────────────────
const sendAdminEmail = async (
  toEmail: string,
  subject: string,
  messageBody: string,
): Promise<void> => {
  const payload = {
    service_id:  ADMIN_EMAILJS_SERVICE_ID,
    template_id: ADMIN_EMAILJS_TEMPLATE_ID,
    user_id:     ADMIN_EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email:      toEmail,
      email_subject: subject,
      message_body:  messageBody,
    },
  };

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    console.warn(`[AdminEmailService] EmailJS error ${response.status}: ${text}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  Exported senders — called from firebaseModerationService.ts
// ─────────────────────────────────────────────────────────────────────────────

/** Sends an "Account Approved" email to the user. */
export const sendAccountApprovedEmail = async (
  toEmail: string,
  firstName: string,
): Promise<void> => {
  await sendAdminEmail(
    toEmail,
    'Your Farm Nest Account Has Been Approved ✅',
    `Hello ${firstName || 'User'},

Great news! Your Farm Nest account has been reviewed and APPROVED by our admin team.

You can now log in and start using the platform.

If you have any questions, feel free to contact our support team.`,
  );
};

/** Sends an "Account Rejected" email to the user, including the admin's reason. */
export const sendAccountRejectedEmail = async (
  toEmail: string,
  firstName: string,
  reason: string,
): Promise<void> => {
  await sendAdminEmail(
    toEmail,
    'Your Farm Nest Account Application — Update',
    `Hello ${firstName || 'User'},

After reviewing your Farm Nest account application, we are unable to approve your registration at this time.

Reason: ${reason || 'No reason provided.'}

If you believe this was a mistake or want to provide more information, please contact our support team.`,
  );
};

/** Sends an "Account Suspended" email to the user. */
export const sendAccountSuspendedEmail = async (
  toEmail: string,
  firstName: string,
  reason: string,
): Promise<void> => {
  await sendAdminEmail(
    toEmail,
    'Your Farm Nest Account Has Been Suspended ⛔',
    `Hello ${firstName || 'User'},

Your Farm Nest account has been suspended by our admin team. You will not be able to log in while the suspension is active.

Reason: ${reason || 'No reason provided.'}

If you think this was done by mistake or want to appeal, please contact our support team.`,
  );
};

/** Sends an "Account Reactivated" email to the user. */
export const sendAccountReactivatedEmail = async (
  toEmail: string,
  firstName: string,
): Promise<void> => {
  await sendAdminEmail(
    toEmail,
    'Your Farm Nest Account Has Been Reactivated 🎉',
    `Hello ${firstName || 'User'},

Good news! Your Farm Nest account has been reactivated by our admin team.

You can now log in and continue using the platform as usual.

Please make sure to follow our platform guidelines going forward.
If you have any questions, contact our support team.`,
  );
};

/*
 * ─── EMAILJS HTML TEMPLATE ───────────────────────────────────────────────────
 * Template ID : template_admin01   (create this in your NEW EmailJS account)
 * Subject     : {{email_subject}}
 * To Email    : {{to_email}}
 *
 * Paste the HTML below into the template editor (HTML tab):
 * ─────────────────────────────────────────────────────────────────────────────

<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 20px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td align="center" style="background:#E8F5E9;padding:32px 24px 28px 24px;">
              <div style="display:inline-block;background:#E8F5E9;border-radius:50%;
                          width:80px;height:80px;line-height:80px;text-align:center;
                          border:2px solid #C8E6C9;font-size:40px;margin-bottom:14px;">
                &#127807;
              </div>
              <br/>
              <span style="font-size:30px;font-weight:900;letter-spacing:1px;">
                <span style="color:#1B1B1B;">Farm </span><span style="color:#2E7D32;">Nest</span>
              </span>
              <p style="color:#2E7D32;font-size:13px;margin:6px 0 0 0;
                        font-weight:600;letter-spacing:0.4px;opacity:0.85;">
                Connecting Farmers, Buyers &amp; Investors
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px 32px;">
              <p style="font-size:15px;color:#444444;line-height:1.9;
                        margin:0 0 24px 0;white-space:pre-line;">{{message_body}}</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F9F9F9;padding:18px 32px;
                       border-top:1px solid #EEEEEE;text-align:center;">
              <p style="margin:0;font-size:12px;color:#AAAAAA;">
                &copy; 2025 Farm Nest &nbsp;|&nbsp; All rights reserved
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>

 * ─────────────────────────────────────────────────────────────────────────────
 */
