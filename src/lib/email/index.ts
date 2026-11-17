import { Resend } from 'resend';
import { env } from '@/lib/env';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Core email sender with safe mock fallback for development & tests.
 * Never throws uncaught errors that could disrupt background webhooks or auth flows.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailParams): Promise<{ success: boolean; simulated?: boolean; error?: string }> {
  const apiKey = env.RESEND_API_KEY || process.env.RESEND_API_KEY;
  const isTest = process.env.NODE_ENV === 'test';

  if (!apiKey || isTest) {
    // In test or unconfigured dev environments, log a clean simulation notice
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[Email Simulation]: To: ${to} | Subject: "${subject}"`);
    }
    return { success: true, simulated: true };
  }

  try {
    const resend = new Resend(apiKey);
    const fromAddress = env.EMAIL_FROM || 'AnswerDesk <onboarding@resend.dev>';

    const { error } = await resend.emails.send({
      from: fromAddress,
      to: [to],
      subject,
      html,
      text: text || subject,
    });

    if (error) {
      console.warn(`[Email Delivery Warning]: Failed sending to ${to}: ${error.message}`);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown email error';
    console.warn(`[Email Delivery Error]: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Common HTML wrapper layout for all AnswerDesk transactional emails.
 */
function wrapEmailTemplate(title: string, bodyContent: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e4e4e7; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <!-- Header -->
    <tr>
      <td style="padding: 28px 32px; background-color: #09090b; text-align: left;">
        <span style="font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">AnswerDesk</span>
      </td>
    </tr>
    <!-- Content -->
    <tr>
      <td style="padding: 32px 32px 28px 32px; line-height: 1.6; font-size: 15px; color: #27272a;">
        ${bodyContent}
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="padding: 20px 32px; background-color: #fafafa; border-top: 1px solid #f4f4f5; text-align: center; font-size: 12px; color: #71717a;">
        <p style="margin: 0 0 6px 0;">AnswerDesk · Automated Knowledge Assistant</p>
        <p style="margin: 0;">You received this transactional email because of your AnswerDesk account.</p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * 1. Welcome Email (Sent on first user registration/sign-in)
 */
export async function sendWelcomeEmail({
  to,
  name,
  appUrl,
}: {
  to: string;
  name?: string;
  appUrl?: string;
}) {
  const recipientName = name ? name.split(' ')[0] : 'there';
  const url = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://answerdesk-ai.vercel.app';
  const dashboardUrl = `${url}/dashboard`;

  const html = wrapEmailTemplate(
    'Welcome to AnswerDesk',
    `
      <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #09090b;">Welcome to AnswerDesk, ${recipientName}! 👋</h1>
      <p style="margin: 0 0 18px 0;">We're excited to help you automate customer support and build an instant AI knowledge assistant for your business.</p>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; margin: 24px 0;">
        <p style="margin: 0 0 12px 0; font-weight: 600; color: #0f172a;">3 Quick Steps to Get Started:</p>
        <ol style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px; line-height: 1.8;">
          <li><strong>Upload Knowledge:</strong> Add your FAQs or upload PDF/text documents.</li>
          <li><strong>Test Your Assistant:</strong> Ask sample questions in the Test Chat console.</li>
          <li><strong>Embed on Your Site:</strong> Copy the 1-line script tag to launch your widget.</li>
        </ol>
      </div>

      <div style="text-align: center; margin: 32px 0 20px 0;">
        <a href="${dashboardUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; font-weight: 600; font-size: 14px; border-radius: 6px; display: inline-block;">
          Open Your Dashboard →
        </a>
      </div>

      <p style="margin: 24px 0 0 0; font-size: 14px; color: #71717a;">
        Need help? Reply directly to this email or visit your dashboard.
      </p>
    `
  );

  return sendEmail({
    to,
    subject: "Welcome to AnswerDesk! 🚀 Let's get your AI Assistant ready",
    html,
    text: `Welcome to AnswerDesk, ${recipientName}! Get started by uploading your FAQs and embedding your widget: ${dashboardUrl}`,
  });
}

/**
 * 2. Subscription Upgrade Confirmation (Sent when checkout.session.completed)
 */
export async function sendSubscriptionSuccessEmail({
  to,
  name,
  workspaceName,
  appUrl,
}: {
  to: string;
  name?: string;
  workspaceName: string;
  appUrl?: string;
}) {
  const recipientName = name ? name.split(' ')[0] : 'there';
  const url = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://answerdesk-ai.vercel.app';
  const billingUrl = `${url}/dashboard`;

  const html = wrapEmailTemplate(
    "You're on AnswerDesk Pro!",
    `
      <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #09090b;">🎉 You're officially on AnswerDesk Pro!</h1>
      <p style="margin: 0 0 18px 0;">Hi ${recipientName}, thank you for your purchase. Your workspace <strong>${workspaceName}</strong> has been upgraded to the <strong>Pro Plan</strong> (₹999/month).</p>
      
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 18px 20px; margin: 24px 0;">
        <p style="margin: 0 0 12px 0; font-weight: 600; color: #166534;">Your Pro Plan Includes:</p>
        <ul style="margin: 0; padding-left: 20px; color: #14532d; font-size: 14px; line-height: 1.8;">
          <li><strong>1,000 AI answers</strong> every month</li>
          <li><strong>500 questions/day</strong> burst protection</li>
          <li><strong>Priority semantic search</strong> with instant indexing</li>
          <li>Full support for English, Hindi, and Marathi queries</li>
        </ul>
      </div>

      <p style="margin: 0 0 24px 0; font-size: 14px; color: #52525b;">
        Your payment receipt and invoice details are available anytime in your billing portal.
      </p>

      <div style="text-align: center; margin: 28px 0 16px 0;">
        <a href="${billingUrl}" style="background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 28px; font-weight: 600; font-size: 14px; border-radius: 6px; display: inline-block;">
          Go to Your Dashboard →
        </a>
      </div>
    `
  );

  return sendEmail({
    to,
    subject: `Receipt & Confirmation: ${workspaceName} is now on AnswerDesk Pro 🎉`,
    html,
    text: `Hi ${recipientName}, your workspace "${workspaceName}" has been successfully upgraded to AnswerDesk Pro! Manage your subscription at: ${billingUrl}`,
  });
}

/**
 * 3. Subscription Cancellation Confirmation (Sent when customer cancels subscription)
 */
export async function sendSubscriptionCancelledEmail({
  to,
  name,
  workspaceName,
  periodEndDate,
  appUrl,
}: {
  to: string;
  name?: string;
  workspaceName: string;
  periodEndDate?: string;
  appUrl?: string;
}) {
  const recipientName = name ? name.split(' ')[0] : 'there';
  const url = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://answerdesk-ai.vercel.app';
  const settingsUrl = `${url}/dashboard`;
  const formattedDate = periodEndDate || 'the end of your current billing cycle';

  const html = wrapEmailTemplate(
    'AnswerDesk Pro Cancellation Update',
    `
      <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #09090b;">Subscription Cancellation Confirmed</h1>
      <p style="margin: 0 0 18px 0;">Hi ${recipientName}, this email confirms that auto-renewal has been cancelled for your workspace <strong>${workspaceName}</strong>.</p>
      
      <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 18px 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0; font-weight: 600; color: #92400e;">Important Information:</p>
        <p style="margin: 0 0 8px 0; color: #78350f; font-size: 14px;">
          • <strong>No future charges:</strong> You will not be charged again.
        </p>
        <p style="margin: 0; color: #78350f; font-size: 14px;">
          • <strong>Full Pro access remains active until:</strong> <strong>${formattedDate}</strong>.
        </p>
      </div>

      <p style="margin: 0 0 20px 0; font-size: 14px; color: #52525b;">
        After ${formattedDate}, your workspace will automatically switch to the Free plan (50 messages/month). If you change your mind, you can re-activate your subscription at any time with one click.
      </p>

      <div style="text-align: center; margin: 28px 0 16px 0;">
        <a href="${settingsUrl}" style="background-color: #09090b; color: #ffffff; text-decoration: none; padding: 12px 28px; font-weight: 600; font-size: 14px; border-radius: 6px; display: inline-block;">
          Manage Workspace Settings →
        </a>
      </div>
    `
  );

  return sendEmail({
    to,
    subject: `Cancellation Confirmation for ${workspaceName} (Active until ${formattedDate})`,
    html,
    text: `Hi ${recipientName}, auto-renewal has been cancelled for "${workspaceName}". You will not be charged again, and your Pro features remain active until ${formattedDate}. Manage settings at: ${settingsUrl}`,
  });
}

