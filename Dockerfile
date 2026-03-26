# Use the official Playwright image for Node.js
FROM mcr.microsoft.com/playwright:v1.49.0-noble AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy source, configuration and prisma
COPY src ./src
COPY configuration ./configuration
COPY prisma ./prisma
COPY tsconfig.json ./

# Build the TypeScript project and generate Prisma Client
RUN npm run build

# --- Runtime Stage ---
FROM mcr.microsoft.com/playwright:v1.49.0-noble AS runner

WORKDIR /app

# Copy built files and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/configuration ./configuration

# Install Chromium (specifically what's needed for Playwright)
RUN npx playwright install chromium

# Expose the default port
EXPOSE 5000

# Start the application
CMD ["npm", "run", "start"]
