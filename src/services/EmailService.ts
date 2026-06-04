/**
 * EmailService.ts
 *
 * Sends emails (password-reset & email-verification) to the user via EmailJS.
 */

export const USE_REAL_EMAIL      = true;
const EMAILJS_SERVICE_ID         = 'service_mf9is4d';   // ✅ Correct Service ID
const EMAILJS_TEMPLATE_ID        = 'template_l0b0lw8';  // ✅ Password-reset Template ID
const EMAILJS_VERIFY_TEMPLATE_ID = 'template_verify01'; // ✅ Email-verification Template ID
const EMAILJS_PUBLIC_KEY         = '9lzX8MKctxzQSnqMG'; // ✅ Your Public Key

// ─────────────────────────────────────────────────────────────────────────────
//  Code generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a cryptographically-mixed 10-character reset code.
 * Always contains at least one uppercase letter, one digit, and one special char.
 * Example output: "A3#mP9@kR!"
 */
export const generateResetCode = (): string => {
  const upper    = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower    = 'abcdefghjkmnpqrstuvwxyz';
  const digits   = '23456789';
  const special  = '#@!$%&*';
  const allChars = upper + lower + digits + special;

  const mandatory = [
    upper  [Math.floor(Math.random() * upper.length)],
    digits [Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];

  const rest: string[] = [];
  for (let i = 0; i < 7; i++) {
    rest.push(allChars[Math.floor(Math.random() * allChars.length)]);
  }

  const combined = [...mandatory, ...rest];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  return combined.join('');
};

// ─────────────────────────────────────────────────────────────────────────────
//  Email sender
// ─────────────────────────────────────────────────────────────────────────────

export const sendResetCodeEmail = async (
  toEmail: string,
  code: string,
  firstName: string,
): Promise<void> => {
  if (!USE_REAL_EMAIL) {
    await new Promise(resolve => setTimeout(resolve, 900));
    return;
  }

  const payload = {
    service_id:  EMAILJS_SERVICE_ID,
    template_id: EMAILJS_TEMPLATE_ID,
    user_id:     EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email:   toEmail,
      user_name:  firstName || 'User',
      reset_code: code,
    },
  };

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`EmailJS error ${response.status}: ${text}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  Email-verification sender  (used on Registration)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Sends a 10-character email-verification code to the newly-registered user.
 * Uses a separate EmailJS template (EMAILJS_VERIFY_TEMPLATE_ID) so the
 * subject line and body can say "Verify your email" instead of "Reset password".
 *
 * Template variables expected:
 *   {{to_email}}   – recipient address
 *   {{user_name}}  – first name
 *   {{verify_code}} – the 10-char code
 */
export const sendVerificationCodeEmail = async (
  toEmail: string,
  code: string,
  firstName: string,
): Promise<void> => {
  if (!USE_REAL_EMAIL) {
    await new Promise(resolve => setTimeout(resolve, 900));
    return;
  }

  const payload = {
    service_id:  EMAILJS_SERVICE_ID,
    template_id: EMAILJS_VERIFY_TEMPLATE_ID,
    user_id:     EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email:    toEmail,
      user_name:   firstName || 'User',
      verify_code: code,
    },
  };

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`EmailJS error ${response.status}: ${text}`);
  }
};

/*
 * ─── EMAILJS HTML TEMPLATE (Email Verification) ──────────────────────────────
 * Template ID : template_verify01   (create this in your EmailJS dashboard)
 * Subject     : Verify Your Farm Nest Account
 * ─────────────────────────────────────────────────────────────────────────────

<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Verify Your Farm Nest Account</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f4f4f4;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 20px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td align="center"
                style="background:#E8F5E9;padding:32px 24px 28px 24px;">
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
              <h2 style="margin:0 0 8px 0;font-size:22px;color:#1B1B1B;font-weight:800;">
                Verify Your Email Address
              </h2>
              <p style="margin:0 0 22px 0;font-size:15px;color:#555555;line-height:1.7;">
                Hello <strong>{{user_name}}</strong>,<br/><br/>
                Thank you for registering on <strong>Farm Nest</strong>!
                Please use the verification code below to confirm your email address.
                This code will <strong>expire in 5&nbsp;minutes</strong>.
              </p>

              <!-- Code box -->
              <div style="background:#F1F8E9;border:2px dashed #66BB6A;border-radius:12px;
                          padding:22px;text-align:center;margin-bottom:26px;">
                <p style="margin:0 0 8px 0;font-size:13px;color:#558B2F;font-weight:600;
                           letter-spacing:0.5px;text-transform:uppercase;">
                  Your Verification Code
                </p>
                <span style="font-size:36px;font-weight:900;color:#2E7D32;letter-spacing:8px;
                             font-family:'Courier New',Courier,monospace;">
                  {{verify_code}}
                </span>
                <p style="margin:12px 0 0 0;font-size:12px;color:#888888;">
                  &#9200;&nbsp;Expires in 5 minutes
                </p>
              </div>

              <p style="margin:0 0 8px 0;font-size:14px;color:#777777;line-height:1.6;">
                If you did not create a Farm Nest account, please ignore this email.
              </p>
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


/*
 * ─── EMAILJS HTML TEMPLATE (Password Reset — existing) ───────────────────────
 * Subject  : Reset Password of Farm Nest Account
 * ─────────────────────────────────────────────────────────────────────────────

<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Reset Password of Farm Nest Account</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f4f4f4;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 20px rgba(0,0,0,0.08);">

          <!-- ── Header / Logo ── -->
          <tr>
            <td align="center"
                style="background:#E8F5E9;padding:32px 24px 28px 24px;">
              <div style="display:inline-block;
                          background:#E8F5E9;
                          border-radius:50%;
                          width:80px;height:80px;
                          line-height:80px;
                          text-align:center;
                          border:2px solid #C8E6C9;
                          font-size:40px;
                          margin-bottom:14px;">
                &#127807;
              </div>
              <br/>
              <span style="font-size:30px;font-weight:900;letter-spacing:1px;">
                <span style="color:#1B1B1B;">Farm </span><span style="color:#2E7D32;">Nest</span>
              </span>
              <p style="color:#2E7D32;font-size:13px;
                        margin:6px 0 0 0;font-weight:600;letter-spacing:0.4px;
                        opacity:0.85;">
                Connecting Farmers, Buyers &amp; Investors
              </p>
            </td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td style="padding:32px 32px 24px 32px;">
              <h2 style="margin:0 0 8px 0;font-size:22px;
                         color:#1B1B1B;font-weight:800;">
                Password Reset Request
              </h2>
              <p style="margin:0 0 22px 0;font-size:15px;
                        color:#555555;line-height:1.7;">
                Hello <strong>{{user_name}}</strong>,<br/><br/>
                We received a request to reset the password for your
                <strong>Farm Nest</strong> account.
                Use the verification code below to complete the process.
                This code will <strong>expire in 5&nbsp;minutes</strong>.
              </p>

              <!-- ── Code box ── -->
              <div style="background:#F1F8E9;
                          border:2px dashed #66BB6A;
                          border-radius:12px;padding:22px;
                          text-align:center;margin-bottom:26px;">
                <p style="margin:0 0 8px 0;font-size:13px;
                           color:#558B2F;font-weight:600;
                           letter-spacing:0.5px;text-transform:uppercase;">
                  Your Verification Code
                </p>
                <span style="font-size:36px;font-weight:900;
                             color:#2E7D32;letter-spacing:8px;
                             font-family:'Courier New',Courier,monospace;">
                  {{reset_code}}
                </span>
                <p style="margin:12px 0 0 0;font-size:12px;color:#888888;">
                  &#9200;&nbsp;Expires in 5 minutes
                </p>
              </div>

              <p style="margin:0 0 8px 0;font-size:14px;
                        color:#777777;line-height:1.6;">
                If you did not request a password reset, please ignore this
                email. Your account remains secure.
              </p>
            </td>
          </tr>

          <!-- ── Footer ── -->
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
