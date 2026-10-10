# Markova Deployment Guide

Complete guide for deploying Markova School Management System on a production server.

---

## 1. Server Requirements

| Resource | Minimum |
|----------|---------|
| OS | Ubuntu 22.04 LTS or newer |
| CPU | 2 cores |
| RAM | 4 GB |
| Disk | 50 GB SSD |
| Network | Static IP or domain name |

## 2. Install Dependencies

### Node.js 20+

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # should be 20.x+
```

### PostgreSQL 15+

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Create the database and user:

```bash
sudo -u postgres psql
```

```sql
CREATE USER markova WITH PASSWORD 'your_secure_password';
CREATE DATABASE markova_db OWNER markova;
GRANT ALL PRIVILEGES ON DATABASE markova_db TO markova;
\q
```

### Redis 7+

```bash
sudo apt update
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

Verify Redis is running:

```bash
redis-cli ping
# Should return PONG
```

Add to your `.env`:

```env
REDIS_URL=redis://localhost:6379
```

### Chromium (PDF Generation)

Chromium is required for server-side PDF generation (report cards, transcripts, etc.).

```bash
sudo apt install -y chromium-browser

# Or on newer Ubuntu (22.04+):
sudo snap install chromium
```

Find the installed path:

```bash
which chromium-browser || which chromium
```

Add to your `.env`:

```env
CHROME_PATH=/usr/bin/chromium-browser
# or /snap/bin/chromium depending on install method
```

## 3. Clone/Download Markova

```bash
cd /opt
sudo git clone https://your-repo-url.git markova
sudo chown -R $USER:$USER /opt/markova
cd /opt/markova
```

## 4. Configure Environment Variables

### Backend

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Required variables:

```env
# Database
DATABASE_URL="postgresql://markova:your_secure_password@localhost:5432/markova_db"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="generate-a-long-random-string-here"
JWT_REFRESH_SECRET="generate-another-long-random-string"

# Server
PORT=3000
NODE_ENV=production

# PDF Generation (Chromium)
CHROME_PATH="/usr/bin/chromium-browser"

# SMS Provider (optional)
SMS_PROVIDER=africas_talking
SMS_API_KEY=your_key
SMS_SENDER_ID=MARKOVA

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_app_password
```

### Web Dashboard

```bash
cp web/.env.example web/.env
nano web/.env
```

```env
NEXT_PUBLIC_API_URL=https://your-domain.com/api
```

## 5. Run Database Migrations

```bash
cd /opt/markova/backend
npm install
npx prisma migrate deploy
```

## 6. Run Seed (Creates Admin Account)

```bash
npx prisma db seed
```

This creates the initial admin account. Default credentials will be shown in the terminal output. **Change the password immediately after first login.**

## 7. Build and Start Backend

```bash
cd /opt/markova/backend
npm run build
```

Test that it starts:

```bash
node dist/main.js
# Should show "Listening on port 3000"
# Press Ctrl+C to stop
```

## 8. Build and Start Web Dashboard

```bash
cd /opt/markova/web
npm install
npm run build
```

Test:

```bash
npm start
# Should show "Ready on port 3001"
# Press Ctrl+C to stop
```

## 9. Configure Reverse Proxy (Nginx)

```bash
sudo apt install -y nginx
```

Create Nginx config:

```bash
sudo nano /etc/nginx/sites-available/markova
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10M;
    }

    # File uploads
    location /uploads/ {
        alias /opt/markova/backend/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Web Dashboard
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/markova /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## 10. SSL Setup (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot will automatically configure SSL and set up auto-renewal.

Verify auto-renewal:

```bash
sudo certbot renew --dry-run
```

## 11. Systemd Services for Auto-Start

### Backend Service

```bash
sudo nano /etc/systemd/system/markova-backend.service
```

```ini
[Unit]
Description=Markova Backend
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/markova/backend
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/markova/backend/.env

[Install]
WantedBy=multi-user.target
```

### Web Dashboard Service

```bash
sudo nano /etc/systemd/system/markova-web.service
```

```ini
[Unit]
Description=Markova Web Dashboard
After=network.target markova-backend.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/markova/web
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable markova-backend markova-web
sudo systemctl start markova-backend markova-web
```

Check status:

```bash
sudo systemctl status markova-backend
sudo systemctl status markova-web
```

## 12. Backup Setup

Create backup script:

```bash
sudo nano /opt/markova/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/opt/markova/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Database backup
pg_dump -U markova markova_db | gzip > "$BACKUP_DIR/db_$TIMESTAMP.sql.gz"

# Uploads backup
tar -czf "$BACKUP_DIR/uploads_$TIMESTAMP.tar.gz" -C /opt/markova/backend uploads/

# Keep only last 30 days of backups
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete

echo "Backup completed: $TIMESTAMP"
```

```bash
sudo chmod +x /opt/markova/backup.sh
```

Add to cron (daily at 2 AM):

```bash
sudo crontab -e
```

```
0 2 * * * /opt/markova/backup.sh >> /var/log/markova-backup.log 2>&1
```

## 13. Update Instructions

When a new version is available:

```bash
cd /opt/markova

# Pull latest code
git pull origin main

# Update backend
cd backend
npm install
npx prisma migrate deploy
npm run build
sudo systemctl restart markova-backend

# Update web
cd ../web
npm install
npm run build
sudo systemctl restart markova-web
```

---

## Troubleshooting

### Backend won't start

1. Check logs: `sudo journalctl -u markova-backend -f`
2. Verify `.env` file has correct `DATABASE_URL`
3. Ensure PostgreSQL is running: `sudo systemctl status postgresql`
4. Verify migrations: `cd backend && npx prisma migrate status`

### Web dashboard shows blank page

1. Check logs: `sudo journalctl -u markova-web -f`
2. Verify `NEXT_PUBLIC_API_URL` in `web/.env` matches your domain
3. Rebuild: `cd web && npm run build && sudo systemctl restart markova-web`

### Database connection errors

1. Check PostgreSQL is running: `sudo systemctl status postgresql`
2. Verify credentials: `psql -U markova -d markova_db -h localhost`
3. Check `pg_hba.conf` allows local connections

### 502 Bad Gateway

1. Check both services are running: `sudo systemctl status markova-backend markova-web`
2. Check Nginx config: `sudo nginx -t`
3. Verify ports 3000 and 3001 are not in use by other processes

### File uploads not working

1. Ensure `uploads/` directory exists and is writable: `sudo mkdir -p /opt/markova/backend/uploads && sudo chown www-data:www-data /opt/markova/backend/uploads`
2. Check Nginx `client_max_body_size` is sufficient

### PDF generation not working

1. Verify Chromium is installed: `which chromium-browser || which chromium`
2. Check `CHROME_PATH` in `.env` matches the actual binary path
3. Ensure required libraries are installed: `sudo apt install -y libnss3 libatk-bridge2.0-0 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 libgtk-3-0`
4. Test Chromium headless: `chromium-browser --headless --disable-gpu --print-to-pdf=/tmp/test.pdf https://example.com`

### Slow performance

1. Check server resources: `htop`
2. Add PostgreSQL indexes if needed
3. Increase Node.js memory: add `--max-old-space-size=2048` to ExecStart
4. Enable Redis caching for frequently accessed data

---

## FAQ for IT Teams

**Q: Can I use a different port?**
A: Yes, change `PORT` in backend `.env` and update the Nginx proxy_pass accordingly.

**Q: How do I reset the admin password?**
A: Run `npx prisma db seed` or update directly in the database.

**Q: Can I run this on Windows Server?**
A: We recommend Ubuntu Linux. Windows is possible with WSL2 but not officially supported.

**Q: How much storage per school?**
A: Approximately 1-2 GB per year for a school with 500 students, depending on file uploads.

**Q: Can multiple schools share one server?**
A: Markova is single-tenant (one database per school). For multiple schools, run separate instances with different databases and ports.

**Q: How do I enable SMS notifications?**
A: Set `TWILIO_SID`, `TWILIO_TOKEN` and `TWILIO_SENDER_ID` in the backend `.env` file. Twilio is the only SMS provider for now.

**Q: How do I set up email notifications?**
A: Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` in the backend `.env` file.
