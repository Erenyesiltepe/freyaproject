# Simple single-stage Dockerfile for production
FROM node:20-alpine

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:./prisma/dev.db

# Set working directory
WORKDIR /app

# Enable pnpm via Corepack
RUN corepack enable

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy the entire project
COPY . .

# Clean and recreate the database
RUN rm -f prisma/dev.db && npx prisma db push

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN pnpm build

# Expose port
EXPOSE 3000

# Start the production server
CMD ["pnpm", "start"]