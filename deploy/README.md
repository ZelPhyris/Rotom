# Deploy Rotom on the VPS

The site is the **React app** in `web/` (built to static files, served by the
system nginx) plus the **web API** in `server/` (a Docker service alongside the
bot and Postgres). Domain: `rotom-pogo.mxrine-mz.dev` (already on the VPS).

```
browser ──► nginx ──┬─ /            ► /var/www/rotom-pogo   (React build)
                    └─ /api/         ► 127.0.0.1:3100        (Fastify, Docker)
                                        └─ db (compose)      ► Postgres
```

## One-time setup (needs sudo)

```bash
# 1. Web root, owned by you so future updates need no sudo
sudo mkdir -p /var/www/rotom-pogo
sudo chown -R "$USER:$USER" /var/www/rotom-pogo

# 2. Build & publish the React site
bash ~/Projects/Rotom/deploy/publish-web.sh

# 3. Install the nginx vhost (SPA fallback + /api proxy)
sudo cp ~/Projects/Rotom/deploy/nginx/rotom-pogo.conf \
        /etc/nginx/sites-available/rotom-pogo
sudo ln -sf /etc/nginx/sites-available/rotom-pogo \
            /etc/nginx/sites-enabled/rotom-pogo
sudo nginx -t && sudo systemctl reload nginx

# 4. HTTPS (Certbot mirrors the config into the 443 block)
sudo certbot --nginx -d rotom-pogo.mxrine-mz.dev
```

> Already had the old static config with SSL? Just re-run `sudo certbot --nginx
> -d rotom-pogo.mxrine-mz.dev` after step 3 so the new `location` blocks are
> copied into the existing HTTPS server block.

## Start the API (Docker)

Fill the new `# --- Web API ---` values in `.env` first (see `.env.example`):
`DISCORD_CLIENT_SECRET`, `SESSION_SECRET` (`openssl rand -hex 32`),
`OAUTH_REDIRECT_URI`, `ADMIN_DISCORD_IDS`.

```bash
cd ~/Projects/Rotom
docker compose up -d --build api      # starts the API (and db if needed)
curl -s localhost:3100/api/health     # -> {"ok":true,...}
```

In the Discord Developer Portal (**OAuth2 → Redirects**) register:
`https://rotom-pogo.mxrine-mz.dev/api/auth/callback`.

## Updating afterwards

```bash
bash ~/Projects/Rotom/deploy/publish-web.sh    # front-end (no sudo)
docker compose up -d --build api               # API after server/ changes
```

## Local development

```bash
# terminal 1 — API on :3100
cd server && npm install && npm run dev

# terminal 2 — React dev server on :5173 (proxies /api to :3100)
cd web && npm install && npm run dev
```

For local login, also register `http://localhost:5173/api/auth/callback` as a
redirect in the Discord portal and point `OAUTH_REDIRECT_URI` at it.
