FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Report cards, transcripts and letters are rendered by headless Chrome through
# puppeteer-core, which ships no browser of its own. Without this the PDF
# endpoints throw at runtime while every other route looks healthy.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
    && rm -rf /var/cache/apk/*
ENV CHROME_PATH=/usr/bin/chromium-browser

# The report templates ask for Poppins by name and expect it to be installed.
# Without it Chromium quietly falls back to FreeSans and every printed report
# card stops looking like the school's.
COPY assets/fonts/*.ttf /usr/share/fonts/poppins/
RUN fc-cache -f

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
# The logo the emails embed and the PDFs fall back to. Read from
# process.cwd()/assets, so it has to sit beside dist.
COPY --from=builder /app/assets ./assets

# Uploaded logos, stamps, signatures and photos live here. Mount a volume over
# it in production - a container rebuild otherwise discards the school's crest.
RUN mkdir -p /app/uploads
VOLUME ["/app/uploads"]

EXPOSE 3000

CMD ["node", "dist/main"]
