# Dark Suite

React frontend + Express/Prisma backend + Postgres.

## Deploy (Docker)

```bash
git clone https://github.com/marbad1994/testjdje.git
cd testjdje
docker compose up -d --build
```

- UI: http://YOUR_IP:4123
- Backend API: http://YOUR_IP:4000
- Postgres: localhost:5432 (user/pass/db: darksuite)

## First use

Open the UI → Settings → Create user. The API key is stored in the browser.

## Notes

- Snapchat endpoints are stubs until an emulator is connected.
- OnlyFans proxy expects ONLYCREATOR_API_URL (default http://host.docker.internal:3001).
