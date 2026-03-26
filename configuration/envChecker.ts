import { readFileSync, existsSync } from "fs";
import * as dotenv from "dotenv";
import { resolve } from "path";

let cfg: Record<string, string | undefined> = {};
let issues: string[] = [];

export const loadEnvVariables = (envPath?: string) => {
  const envFile = envPath || resolve(process.cwd(), ".env");

  if (!existsSync(envFile)) {
    console.error(`Env file not found at: ${envFile}`);
    return;
  }

  const handle = readFileSync(envFile, "utf-8");
  const parsed = dotenv.parse(handle);

  for (const key in parsed) {
    if (!process.env[key]) {
      process.env[key] = parsed[key];
    }
  }

  cfg = { ...process.env };
};

export const checkNonEmpty = (key: string, description?: string): boolean => {
  const v = cfg[key] || process.env[key];
  const desc = description ? ` ${description}` : "";

  if (!v || v.trim() === "") {
    issues.push(`${key} is missing or empty.${desc}`);
    return false;
  }
  return true;
};

export const checkIsValidUrl = (key: string) => {
  if (!checkNonEmpty(key)) return;

  const urlString = cfg[key] || process.env[key];
  if (!urlString) return;

  try {
    new URL(urlString);
  } catch (error) {
    issues.push(`${key} is not a valid URL`);
  }
};

export const validateDatabaseVars = () => {
  checkIsValidUrl("DATABASE_URL");
};

export const validateEmailVars = () => {
  checkNonEmpty("EMAIL_USER", "Google Email Address needed for Nodemailer");
  checkNonEmpty("EMAIL_PASS", "Google App Password needed for Nodemailer");
};

export const validateCaptchaVars = () => {
  checkNonEmpty("RECAPTCHA_SECRET_KEY", "Google ReCaptcha Secret Key is required");
};

export const validateEnv = () => {
  issues = []; // reset issues

  validateDatabaseVars();
  validateEmailVars();
  validateCaptchaVars();
  // Add more validations here as needed

  if (issues.length > 0) {
    console.error("❌ Invalid environment configurations detected:");
    issues.forEach((issue) => console.error(`  - ${issue}`));
    process.exit(1);
  }
};
