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

# Las variables NEXT_PUBLIC_* se incrustan en el bundle durante el build.
# Vienen de `.env.production` (versionado en el repo): son valores públicos que
# de todos modos viajan al navegador. Así no dependemos de "build args", que no
# existen en todas las versiones de EasyPanel.
# OJO: no declarar ARG/ENV para ellas aquí — si el builder no las pasa, quedarían
# vacías y pisarían al archivo, compilando la app sin conexión a Supabase.
ENV NEXT_TELEMETRY_DISABLED=1

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
