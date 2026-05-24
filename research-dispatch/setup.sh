#!/usr/bin/env bash

# setup.sh - one-shot VPS install for research-dispatch (inside ZAOcowork)
#
# Assumes: Ubuntu 22.04+, node 20+, git, gh CLI, claude CLI already on $PATH.
# Run as the user that the cron + bot will execute under (typically `zao`).

set -euo pipefail

ZAOCOWORK_DIR="${ZAOCOWORK_DIR:-${HOME}/repos/ZAOcowork}"
ZABALGAMES_DIR="${ZABALGAMES_DIR:-${HOME}/repos/zabalgames}"
ENV_FILE="${HOME}/.research-dispatch.env"

echo "[setup] research-dispatch install"
echo "[setup] ZAOCOWORK_DIR=${ZAOCOWORK_DIR}"
echo "[setup] ZABALGAMES_DIR=${ZABALGAMES_DIR}"
echo "[setup] ENV_FILE=${ENV_FILE}"

# 1. Clone repos if missing.
mkdir -p "$(dirname "$ZAOCOWORK_DIR")"
if [ ! -d "$ZAOCOWORK_DIR/.git" ]; then
  echo "[setup] cloning ZAOcowork"
  git clone https://github.com/ZAODEVZ/ZAOcowork.git "$ZAOCOWORK_DIR"
else
  echo "[setup] ZAOcowork already cloned, pulling latest"
  git -C "$ZAOCOWORK_DIR" pull --rebase
fi

if [ ! -d "$ZABALGAMES_DIR/.git" ]; then
  echo "[setup] cloning zabalgames"
  git clone https://github.com/ZAODEVZ/zabalgames.git "$ZABALGAMES_DIR"
else
  echo "[setup] zabalgames already cloned, pulling latest"
  git -C "$ZABALGAMES_DIR" pull --rebase
fi

DISPATCH_DIR="$ZAOCOWORK_DIR/research-dispatch"

# 2. Set up env file scaffold.
if [ ! -f "$ENV_FILE" ]; then
  echo "[setup] creating ${ENV_FILE} from template"
  cp "$DISPATCH_DIR/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  sed -i "s|RESEARCH_DISPATCH_DIR=.*|RESEARCH_DISPATCH_DIR=${DISPATCH_DIR}|" "$ENV_FILE"
  sed -i "s|ZABALGAMES_REPO_PATH=.*|ZABALGAMES_REPO_PATH=${ZABALGAMES_DIR}|" "$ENV_FILE"
  echo "[setup] EDIT ${ENV_FILE} and fill in: BONFIRE_API_KEY, GH_TOKEN, TELEGRAM_*"
else
  echo "[setup] ${ENV_FILE} already exists, leaving alone"
fi

# 3. Verify deps.
echo "[setup] checking deps..."
for cmd in node git gh; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[setup] FATAL: missing required binary: $cmd" >&2
    exit 1
  fi
  echo "[setup]   ok: $(command -v $cmd)"
done

if ! command -v claude >/dev/null 2>&1; then
  echo "[setup] WARN: claude CLI not on PATH. Install with:"
  echo "       curl -fsSL https://claude.ai/install.sh | bash"
  echo "       Then: claude auth login   (use your Max plan)"
fi

# 4. Cron install hint (not auto-installed).
echo ""
echo "[setup] To install the Sunday cron, run:"
echo "        (crontab -l 2>/dev/null; echo '0 21 * * 0 ${DISPATCH_DIR}/cron/sunday-research.sh >> /var/log/research-dispatch-cron.log 2>&1') | crontab -"
echo ""

# 5. Test the wiring with a dry run.
echo "[setup] dry-running dispatch script (no API calls, no spawns)..."
cd "$DISPATCH_DIR"
RESEARCH_DISPATCH_DIR="$DISPATCH_DIR" node scripts/run-dispatch.mjs --next --dry 2>&1 | sed 's/^/[dry] /'

echo ""
echo "[setup] Done. Next steps:"
echo "  1. Edit ${ENV_FILE} - fill in BONFIRE_API_KEY + GH_TOKEN"
echo "  2. claude auth login (if not yet authed)"
echo "  3. Test manually: RESEARCH_DISPATCH_DIR=${DISPATCH_DIR} node ${DISPATCH_DIR}/scripts/run-dispatch.mjs --slug hats-protocol"
echo "  4. Install the Sunday cron (line above)"
echo "  5. Wire bot/telegram-research-command.mjs into ZAOcoworkingBot (ZAOcowork/agent/) or any existing Telegram bot"
