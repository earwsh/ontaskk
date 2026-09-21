#!/usr/bin/env bash
set -e

ROOT_DIR="/home/earwsh/app/task-on"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend-next"
PG_SOCKET_DIR="/home/earwsh/app/ontask/backend/pgdata/run"

echo "=== بررسی وضعیت دیتابیس لوکال ==="
if ! psql -p 5433 -h "$PG_SOCKET_DIR" -U earwsh -d ontask -c "SELECT 1;" >/dev/null 2>&1; then
  echo "PostgreSQL روی پورت ۵۴۳۳ در حال اجرا نیست. در حال راه‌اندازی..."
  rm -f "$ROOT_DIR/backend/pgdata/postmaster.pid" "$PG_SOCKET_DIR/.s.PGSQL.5433*"
  pg_ctl -D "$ROOT_DIR/backend/pgdata" -o "-p 5433" -l "$ROOT_DIR/backend/pgdata/pg.log" start
  sleep 2
fi
echo "✓ دیتابیس لوکال آماده است."

echo "=== راه‌اندازی سرور بک‌اند (پورت ۴۰۰۰) ==="
cd "$BACKEND_DIR"
pkill -f "tsx watch src/index.ts" || true
nohup npx tsx watch src/index.ts > backend.log 2>&1 &
BACKEND_PID=$!
echo "بک‌اند با شناسه $BACKEND_PID اجرا شد."

echo "=== راه‌اندازی فرانت‌اند Next.js (پورت ۳۰۰۰) ==="
cd "$FRONTEND_DIR"
pkill -f "next start -H 0.0.0.0" || true
pkill -f "next dev -H 0.0.0.0" || true
nohup npx next start -H 0.0.0.0 -p 3000 > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "فرانت‌اند با شناسه $FRONTEND_PID اجرا شد."

echo ""
echo "═══════════════════════════════════════════════"
echo "  سامانه تسک‌آن نسخه لوکال با موفقیت ران شد!"
echo "  آدرس فرانت‌اند: http://localhost:3000/dashboard/finance"
echo "  آدرس بک‌اند:   http://localhost:4000/api/health"
echo "═══════════════════════════════════════════════"
