# Use the official Playwright image
FROM mcr.microsoft.com/playwright:v1.49.0-noble

WORKDIR /app

# 1. Copy the shared configuration folder from the root
COPY configuration ./configuration

# 2. Copy the backend application
COPY apps/backend ./apps/backend

# 3. Copy root package files (needed for workspaces)
COPY package.json package-lock.json ./

# Switch into the backend directory
WORKDIR /app/apps/backend

# Install dependencies (this will install everything including shared ones)
RUN npm install

# Generate Prisma Client
RUN npx prisma generate

# Final browser check
RUN npx playwright install chromium

# Start the application
CMD ["npm", "run", "start"]
