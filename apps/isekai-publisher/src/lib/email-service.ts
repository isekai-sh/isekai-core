import { Resend } from 'resend';
import { env } from './env.js';

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!env.RESEND_API_KEY) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}

export interface User {
  id: string;
  username: string;
  email?: string | null;
}

export async function sendRefreshTokenWarningEmail(
  user: User,
  daysUntilExpiry: number,
  scheduledPostsCount: number
) {
  const resend = getResendClient();
  if (!resend) {
    return;
  }

  if (!user.email) {
    console.log(`[Email] Skipping warning email for ${user.username} - no email address`);
    return;
  }

  try {
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to: user.email,
      subject: `Action Required: Your DeviantArt connection expires in ${daysUntilExpiry} days`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #ea580c; margin-bottom: 16px;">Your DeviantArt Connection is Expiring Soon</h2>
          <p style="font-size: 16px; line-height: 1.6; color: #1f2937;">Hi ${user.username},</p>
          <p style="font-size: 16px; line-height: 1.6; color: #1f2937;">
            Your DeviantArt authentication will expire in <strong style="color: #ea580c;">${daysUntilExpiry} days</strong>.
          </p>
          <p style="font-size: 16px; line-height: 1.6; color: #1f2937;">
            You have <strong>${scheduledPostsCount} scheduled post${scheduledPostsCount !== 1 ? 's' : ''}</strong> that will be affected if you don't re-authenticate.
          </p>

          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0;">
            <h3 style="margin-top: 0; margin-bottom: 12px; color: #92400e;">What you need to do:</h3>
            <ol style="margin: 0; padding-left: 20px; color: #78350f;">
              <li style="margin-bottom: 8px;">Log in to your Isekai dashboard</li>
              <li style="margin-bottom: 8px;">Click the "Re-connect DeviantArt" button</li>
              <li>Authorize the application</li>
            </ol>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${env.FRONTEND_URL}/settings"
               style="background: #4F46E5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
              Re-connect Now
            </a>
          </div>

          <p style="font-size: 14px; line-height: 1.6; color: #6b7280;">
            If you don't re-authenticate, your scheduled posts will be moved to drafts and won't be published automatically.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

          <p style="font-size: 14px; color: #9ca3af;">
            Best regards,<br>
            The Isekai Team
          </p>
        </div>
      `,
    });
    console.log(`[Email] Sent warning email to ${user.username} (${user.email})`);
  } catch (error) {
    console.error(`[Email] Failed to send warning email to ${user.username}:`, error);
  }
}

export async function sendRefreshTokenExpiredEmail(user: User, scheduledPostsCount: number) {
  const resend = getResendClient();
  if (!resend) {
    return;
  }

  if (!user.email) {
    console.log(`[Email] Skipping expired email for ${user.username} - no email address`);
    return;
  }

  try {
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to: user.email,
      subject: 'Urgent: Your DeviantArt connection has expired',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #dc2626; margin-bottom: 16px;">Your DeviantArt Connection Has Expired</h2>
          <p style="font-size: 16px; line-height: 1.6; color: #1f2937;">Hi ${user.username},</p>
          <p style="font-size: 16px; line-height: 1.6; color: #1f2937;">
            Your DeviantArt authentication has expired. We've moved <strong style="color: #dc2626;">${scheduledPostsCount} scheduled post${scheduledPostsCount !== 1 ? 's' : ''}</strong> to drafts to prevent publishing failures.
          </p>

          <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 16px; margin: 24px 0;">
            <h3 style="margin-top: 0; margin-bottom: 12px; color: #991b1b;">To resume automatic publishing:</h3>
            <ol style="margin: 0; padding-left: 20px; color: #7f1d1d;">
              <li style="margin-bottom: 8px;">Log in to your Isekai dashboard</li>
              <li style="margin-bottom: 8px;">Click the "Re-connect DeviantArt" button</li>
              <li style="margin-bottom: 8px;">Authorize the application</li>
              <li>Re-schedule your posts</li>
            </ol>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${env.FRONTEND_URL}/settings"
               style="background: #DC2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
              Re-connect Now
            </a>
          </div>

          <p style="font-size: 14px; line-height: 1.6; color: #6b7280;">
            Your drafts are safe and waiting for you!
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

          <p style="font-size: 14px; color: #9ca3af;">
            Best regards,<br>
            The Isekai Team
          </p>
        </div>
      `,
    });
    console.log(`[Email] Sent expired email to ${user.username} (${user.email})`);
  } catch (error) {
    console.error(`[Email] Failed to send expired email to ${user.username}:`, error);
  }
}

export async function sendRefreshTokenExpiredJobNotification(user: User, deviationTitle: string) {
  const resend = getResendClient();
  if (!resend) {
    return;
  }

  if (!user.email) {
    console.log(`[Email] Skipping job failure email for ${user.username} - no email address`);
    return;
  }

  try {
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to: user.email,
      subject: `Publishing Failed: "${deviationTitle}" - Authentication Required`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #dc2626; margin-bottom: 16px;">Publishing Failed - Authentication Expired</h2>
          <p style="font-size: 16px; line-height: 1.6; color: #1f2937;">Hi ${user.username},</p>
          <p style="font-size: 16px; line-height: 1.6; color: #1f2937;">
            We tried to publish your deviation "<strong>${deviationTitle}</strong>" but your DeviantArt authentication has expired.
          </p>
          <p style="font-size: 16px; line-height: 1.6; color: #1f2937;">
            All of your scheduled posts have been moved to drafts to prevent further failures.
          </p>

          <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 16px; margin: 24px 0;">
            <h3 style="margin-top: 0; margin-bottom: 12px; color: #991b1b;">To resume publishing:</h3>
            <ol style="margin: 0; padding-left: 20px; color: #7f1d1d;">
              <li style="margin-bottom: 8px;">Log in to your Isekai dashboard</li>
              <li style="margin-bottom: 8px;">Click the "Re-connect DeviantArt" button</li>
              <li>Re-schedule your posts</li>
            </ol>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${env.FRONTEND_URL}/drafts"
               style="background: #4F46E5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
              View Your Drafts
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

          <p style="font-size: 14px; color: #9ca3af;">
            Best regards,<br>
            The Isekai Team
          </p>
        </div>
      `,
    });
    console.log(`[Email] Sent job failure email to ${user.username} (${user.email})`);
  } catch (error) {
    console.error(`[Email] Failed to send job failure email to ${user.username}:`, error);
  }
}
