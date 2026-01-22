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
}

const sendEmail = async (c: Context, sendEmailInput: SendEmailInput): Promise<void> => {
  // Skip sending emails to example.com addresses (for testing)
  if (sendEmailInput.to.endsWith("@example.com")) {
    return;
  }
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
  const msg = {
    personalizations: [
      {
        subject: sendEmailInput.subject,
        to: [{
          email: sendEmailInput.to,
          name: sendEmailInput.to_name ?? undefined
        }],
        from: {
          email: emailFrom,
          name: EMAIL_FROM_NAME
        },
        dynamic_template_data: {
          html: sendEmailInput.html,
        }
      },
    ],
    from: {
      email: emailFrom,
      name: EMAIL_FROM_NAME
    },
    reply_to: {
      email: emailFrom,
      name: EMAIL_FROM_NAME
    },
    subject: sendEmailInput.subject,
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
  const subject = 'mHUB - Your one-time password';
  const html = `<p>Hi, ${to_name}</p>
<p>Your one-time password is ${password}</p>`;
  return sendEmail(c, {
    to,
    to_name,
    subject,
    html,
  });
}
