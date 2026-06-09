# Deploy the interactive map on the VPS (nginx)

The map is a static site served directly by the existing system nginx, under the
subdomain `rotom-pogo.mxrine-mz.dev` (already pointing to the VPS).

## One-time setup (needs sudo)

```bash
# 1. Web root, owned by you so future updates need no sudo
sudo mkdir -p /var/www/rotom-pogo
sudo chown -R "$USER:$USER" /var/www/rotom-pogo

# 2. Publish the site files
bash ~/Projects/Rotom/deploy/publish.sh

# 3. Install the nginx vhost
sudo cp ~/Projects/Rotom/deploy/nginx/rotom-pogo.conf \
        /etc/nginx/sites-available/rotom-pogo
sudo ln -sf /etc/nginx/sites-available/rotom-pogo \
            /etc/nginx/sites-enabled/rotom-pogo
sudo nginx -t && sudo systemctl reload nginx
# -> http://rotom-pogo.mxrine-mz.dev now serves the map

# 4. HTTPS (Certbot, like the other subdomains)
sudo certbot --nginx -d rotom-pogo.mxrine-mz.dev
# -> https://rotom-pogo.mxrine-mz.dev with auto-renewing certificate
```

## Updating the map afterwards

```bash
bash ~/Projects/Rotom/deploy/publish.sh   # no sudo needed
```

## Live counts

The bot writes per-sector totals. Point the counts writer at the web root (or
copy after writing) and schedule it, e.g. publish fresh numbers every 10 min:

```bash
# crontab -e
*/10 * * * * cp ~/Projects/Rotom/app/counts.json /var/www/rotom-pogo/counts.json
```

Only aggregated counts are published — never member identities.
