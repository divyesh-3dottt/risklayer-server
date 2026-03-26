export const generateOtpEmail = (otp: string): string => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; text-align: center; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333;">Welcome to RiskLayer</h2>
        <p style="font-size: 16px; color: #555;">Use the verification code below to securely log into your account:</p>
        <div style="margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 6px;">
            <h1 style="color: #4A90E2; letter-spacing: 5px; margin: 0; font-size: 32px;">${otp}</h1>
        </div>
        <p style="font-size: 14px; color: #888;">This code will expire in 5 minutes.</p>
        <p style="font-size: 14px; color: #888; margin-top: 30px;">If you did not request this code, you can safely ignore this email.</p>
    </div>
    `;
};
