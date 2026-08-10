#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
ANALYSIS_PY_DIR="$ROOT_DIR/analysis-py"
ANALYSIS_RS_DIR="$ROOT_DIR/analysis-rs"
PGDATA="$BACKEND_DIR/pgdata"
PGPORT=5433
BACKEND_PORT=4000
FRONTEND_PORT=3000
PY_PORT=5100
RS_PORT=5200

cleanup() {
  echo ""
  echo "Stopping all services..."
  kill "$FRONTEND_PID" 2>/dev/null || true
  kill "$BACKEND_PID" 2>/dev/null || true
  kill "$PY_PID" 2>/dev/null || true
  kill "$RS_PID" 2>/dev/null || true
  if [ -n "$PG_PID" ]; then
    pg_ctl -D "$PGDATA" -o "-p $PGPORT" stop 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  echo "All services stopped."
  exit 0
}
trap cleanup SIGINT SIGTERM

cd "$ROOT_DIR"

# ── Check dependencies ──
if [ ! -f "$BACKEND_DIR/node_modules/.package-lock.json" ]; then
  echo "Installing backend dependencies..."
  (cd "$BACKEND_DIR" && npm install)
fi
if [ ! -f "$FRONTEND_DIR/node_modules/.package-lock.json" ]; then
  echo "Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
fi
# ── PostgreSQL ──
if pg_isready -h localhost -p $PGPORT -q 2>/dev/null; then
  echo "PostgreSQL already running on port $PGPORT"
  PG_PID=""
else
  echo "Starting PostgreSQL on port $PGPORT..."
  pg_ctl -D "$PGDATA" -o "-p $PGPORT" -l "$PGDATA/pg.log" start
  PG_PID=1
  until pg_isready -h localhost -p $PGPORT -q 2>/dev/null; do
    sleep 1
  done
  echo "PostgreSQL ready"
fi

# ── Analysis microservices (Python + Rust) ──
if [ -f "$ANALYSIS_PY_DIR/requirements.txt" ]; then
  if [ ! -d "$ANALYSIS_PY_DIR/.venv" ]; then
    echo "Setting up Python analysis venv..."
    (cd "$ANALYSIS_PY_DIR" && python3 -m venv .venv && ./.venv/bin/pip install -q -r requirements.txt)
  fi
  echo "Starting Python analysis service on port $PY_PORT..."
  (cd "$ANALYSIS_PY_DIR" && ./.venv/bin/uvicorn main:app --host 0.0.0.0 --port $PY_PORT > /tmp/analysis-py.log 2>&1) &
  PY_PID=$!
  echo "Waiting for Python analysis service..."
  until curl -s http://localhost:$PY_PORT/health >/dev/null 2>&1; do
    sleep 1
  done
  echo "Python analysis service ready"
else
  echo "Skipping Python analysis service (analysis-py/requirements.txt not found)"
  PY_PID=""
fi

# Ensure rustup/cargo are visible even when start.sh is launched from a minimal PATH
export PATH="$HOME/.cargo/bin:$PATH"

if [ -f "$ANALYSIS_RS_DIR/Cargo.toml" ]; then
  if ! command -v cargo >/dev/null 2>&1; then
    echo "WARNING: cargo not found — skipping Rust analysis service. Install with:"
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    RS_PID=""
  else
    echo "Starting Rust analysis service on port $RS_PORT..."
    RS_BIN="$ANALYSIS_RS_DIR/target/release/analysis-rs"
    # Prefer prebuilt binary (fast restart); rebuild if missing
    if [ ! -x "$RS_BIN" ]; then
      echo "Building analysis-rs (release)..."
      if ! (cd "$ANALYSIS_RS_DIR" && cargo build --release >> /tmp/analysis-rs.log 2>&1); then
        echo "WARNING: Rust analysis build failed — see /tmp/analysis-rs.log"
        RS_PID=""
      fi
    fi
    if [ -x "$RS_BIN" ]; then
      : > /tmp/analysis-rs.log
      (cd "$ANALYSIS_RS_DIR" && "$RS_BIN" >> /tmp/analysis-rs.log 2>&1) &
      RS_PID=$!
      echo "Waiting for Rust analysis service..."
      RS_WAIT=0
      until curl -s http://localhost:$RS_PORT/health >/dev/null 2>&1; do
        sleep 1
        RS_WAIT=$((RS_WAIT + 1))
        if [ "$RS_WAIT" -ge 30 ]; then
          echo "WARNING: Rust analysis service did not become healthy in 30s — see /tmp/analysis-rs.log"
          break
        fi
        if ! kill -0 "$RS_PID" 2>/dev/null; then
          echo "WARNING: Rust analysis process exited early — see /tmp/analysis-rs.log"
          break
        fi
      done
      if curl -s http://localhost:$RS_PORT/health >/dev/null 2>&1; then
        echo "Rust analysis service ready"
      fi
    else
      echo "WARNING: analysis-rs binary missing after build — skipping"
      RS_PID=""
    fi
  fi
else
  echo "Skipping Rust analysis service (analysis-rs/Cargo.toml not found)"
  RS_PID=""
fi

# ── Backend ──
echo "Starting backend on port $BACKEND_PORT..."
cd "$BACKEND_DIR"
npm run dev &
BACKEND_PID=$!
echo "Waiting for backend..."
until curl -s http://localhost:$BACKEND_PORT/api/health >/dev/null 2>&1; do
  sleep 1
done
echo "Backend ready"

# ── Frontend ──
echo "Building frontend..."
cd "$FRONTEND_DIR"
npm run build
echo "Starting frontend on port $FRONTEND_PORT..."
npm start &
FRONTEND_PID=$!
echo "Waiting for frontend..."
until curl -s http://localhost:$FRONTEND_PORT >/dev/null 2>&1; do
  sleep 1
done
echo "Frontend ready"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  OnTask is running!                  ║"
echo "║  Frontend: http://localhost:$FRONTEND_PORT  ║"
echo "║  Backend:  http://localhost:$BACKEND_PORT   ║"
echo "║  Python:   http://localhost:$PY_PORT        ║"
echo "║  Rust:     http://localhost:$RS_PORT        ║"
echo "║  DB:       localhost:$PGPORT/ontask        ║"
echo "║                                          ║"
echo "║  Press Ctrl+C to stop all services       ║"
echo "╚══════════════════════════════════════╝"
echo ""

wait
