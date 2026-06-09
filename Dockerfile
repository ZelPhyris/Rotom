FROM node:22-bookworm-slim

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the application source.
COPY . .

CMD ["npm", "start"]
