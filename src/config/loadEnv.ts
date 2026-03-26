import {
  loadEnvVariables,
  validateEnv,
  checkNonEmpty,
  checkIsValidUrl,
} from "../../configuration/envChecker";

// Load environment variables from the root .env
loadEnvVariables();

// You can add backend-specific validations before the general validation if you want
// For example:
// checkNonEmpty("PORT");

// Perform the validations (validates database vars by default, exits if error)
validateEnv();

export const envConfig = { loadEnvVariables, validateEnv, checkNonEmpty, checkIsValidUrl };
