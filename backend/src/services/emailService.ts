import { Context } from "hono";

const SENDGRID_API_URL = "https://api.sendgrid.com/v3";
const EMAIL_FROM_NAME = "mHUB";

export interface SendOneTimePasswordInput {
  to: string;
  to_name: string;
  password: string;
}

interface SendEmailInput {
  to: string;
  to_name?: string;
  subject: string;
  html: string;
  text?: string;
}

const sendEmail = async (c: Context, sendEmailInput: SendEmailInput): Promise<void> => {
  // Skip sending emails to example.com addresses (for testing)
  if (sendEmailInput.to.endsWith("@example.com")) {
    return;
  }
  const apiKey = c.env.SENDGRID_API_KEY;
  const emailFrom = c.env.SENDGRID_EMAIL_FROM;
  if (!apiKey) {
    throw new Error("SendGrid API key is not configured");
  }
  if (!emailFrom) {
    throw new Error("SendGrid email from address is not configured");
  }
  const plainText = sendEmailInput.text ?? sendEmailInput.html.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const msg = {
    personalizations: [
      {
        to: [{ email: sendEmailInput.to, name: sendEmailInput.to_name ?? undefined }],
      },
    ],
    from: { email: emailFrom, name: EMAIL_FROM_NAME },
    reply_to: { email: emailFrom, name: EMAIL_FROM_NAME },
    subject: sendEmailInput.subject,
    content: [
      { type: 'text/plain', value: plainText },
      { type: 'text/html', value: sendEmailInput.html },
    ],
  };
  const res = await fetch(`${SENDGRID_API_URL}/mail/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(msg),
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error("Failed to send email:", errorText);
    throw new Error(`Failed to send email: ${res.status} ${res.statusText}`);
  }
  console.log(`Email sent to ${sendEmailInput.to}`);
};

const sendBulkEmails = async (c: Context, sendEmailInputs: SendEmailInput[]): Promise<void> => {
  // Send emails in 1 request to SendGrid
  const apiKey = c.env.SENDGRID_API_KEY;
  const emailFrom = c.env.SENDGRID_EMAIL_FROM;
  const baseTemplateId = c.env.SENDGRID_BASE_TEMPLATE_ID;

  if (!apiKey) {
    throw new Error("SendGrid API key is not configured");
  }
  if (!emailFrom) {
    throw new Error("SendGrid email from address is not configured");
  }
  if (!baseTemplateId) {
    throw new Error("SendGrid base template ID is not configured");
  }
  const personalizations = sendEmailInputs.map(input => ({
    to: [{
      email: input.to,
      name: input.to_name ?? undefined
    }],
    subject: input.subject,
    dynamic_template_data: {
      html: input.html,
      text: input.text ?? input.html.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim(),
    }
  }));
  const msg = {
    personalizations,
    from: {
      email: emailFrom,
      name: EMAIL_FROM_NAME
    },
    reply_to: {
      email: emailFrom,
      name: EMAIL_FROM_NAME
    },
    subject: " ", // Will be overridden by personalizations
    template_id: baseTemplateId,
  };
  const res = await fetch(`${SENDGRID_API_URL}/mail/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(msg),
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error("Failed to send bulk emails:", errorText);
    throw new Error(`Failed to send bulk emails: ${res.status} ${res.statusText}`);
  }
  console.log(`Bulk email sent to ${sendEmailInputs.length} recipients`);
};

export const sendOneTimePasswordEmail = async (c: Context, sendOneTimePasswordInput: SendOneTimePasswordInput): Promise<void> => {
  const { to, to_name, password } = sendOneTimePasswordInput;
  const firstName = to_name?.split(' ')[0] ?? to_name ?? 'there';
  const subject = `Your mHUB login code: ${password}`;
  const html = `<p>Hi ${firstName},</p>
<p>Your one-time password is <strong>${password}</strong></p>
<p>Enter this code to sign in to mHUB. It expires in 10 minutes.</p>
<p>If you didn't request this, you can safely ignore this email.</p>
<p>— The mHUB Team</p>`;
  const text = `Hi ${firstName},\n\nYour one-time password is ${password}\n\nEnter this code to sign in to mHUB. It expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\n— The mHUB Team`;
  return sendEmail(c, {
    to,
    to_name,
    subject,
    html,
    text,
  });
}
