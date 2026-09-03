# syntax=docker/dockerfile:1

# ---------- Frontend builder (Vite + Tailwind) ----------
FROM node:24-alpine AS builder
WORKDIR /app
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
COPY package.json package-lock.json* ./
RUN npm install
COPY . ./
RUN npm run build

# ---------- Static server ----------
FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
