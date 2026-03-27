import { Resend } from "resend";
import { logger } from "./logger";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    // If we're using Resend onboarding API key, we must use delivered@resend.dev as sender
    // and can only send to the own email address. 
    // Once a custom domain is added to Resend, this can be updated.
    const fromAddress = process.env.EMAIL_FROM || "onboarding@resend.dev";

    const { data, error } = await resend.emails.send({
      from: `RiskLayer <${fromAddress}>`,
      to,
      subject,
      html,
    });

    if (error) {
      logger.error(`Resend error for ${to}:`, error);
      throw error;
    }

    logger.info(`Email sent to ${to}: ${data?.id}`);
    return data;
  } catch (error) {
    logger.error(`Fatal error sending email to ${to}:`, error);
    throw error;
  }
};
