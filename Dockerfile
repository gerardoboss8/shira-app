# =====================================================================
# Shira App · Dockerfile (Next.js 16 standalone)
# Imagen final ~150MB, arranque rápido, usuario sin privilegios.
# =====================================================================

# ---------- 1. Dependencias ----------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 2. Build ----------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# IMPORTANTE: las variables NEXT_PUBLIC_* se incrustan en el bundle durante
# el build, así que deben existir AQUÍ (no basta ponerlas en runtime).
# En EasyPanel se configuran como "Build Args".
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_TZ="America/Guatemala"
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_TZ=$NEXT_PUBLIC_TZ \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---------- 3. Ejecución ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=America/Guatemala

# Usuario sin privilegios (buena práctica de seguridad)
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
