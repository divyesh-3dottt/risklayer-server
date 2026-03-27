# --- Builder Stage ---
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS builder

WORKDIR /app

# Copy package files and install ALL dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy source code and Prisma schema
COPY . .

# Generate Prisma Client and Build TypeScript
RUN npx prisma generate
RUN npm run build

# --- Runtime Stage ---
# Use the same base to ensure system dependencies match, but optimize steps
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy only what's necessary for runtime
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/configuration ./configuration

# Install ONLY production dependencies (much faster and smaller)
RUN npm install --only=production

# IMPORTANT: Remove the manual browser install. 
# The mcr.microsoft.com/playwright image ALREADY has Chromium/Firefox/Webkit pre-installed.
# This saves ~500MB and 2-3 minutes of build time.

EXPOSE 5000

# Start the application
CMD ["npm", "run", "start"]
