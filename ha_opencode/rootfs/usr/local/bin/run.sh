#!/usr/bin/env bash
set -e

# =============================================================================
# HA OpenCode - Home Assistant Add-on - Main Entry Point
# =============================================================================

# Use bashio for proper Home Assistant add-on logging if available
if command -v bashio &> /dev/null; then
    bashio::log.info "=============================================="
    bashio::log.info "  HA OpenCode for Home Assistant"
    bashio::log.info "  Starting services..."
    bashio::log.info "=============================================="
else
    echo "[INFO] =============================================="
    echo "[INFO]   HA OpenCode for Home Assistant"
    echo "[INFO]   Starting services..."
    echo "[INFO] =============================================="
fi

# Export supervisor token for child processes
export SUPERVISOR_TOKEN="${SUPERVISOR_TOKEN}"

# Set home to persistent data directory
export HOME="/data"
export XDG_DATA_HOME="/data/.local/share"
export XDG_CONFIG_HOME="/data/.config"

# Ensure data directories exist with proper structure
mkdir -p /data/.local/share/opencode
mkdir -p /data/.config/opencode

# Copy default MCP config if it doesn't exist
if [ ! -f "/data/.config/opencode/opencode.json" ]; then
    cp /opt/ha-mcp-server/opencode-ha.json /data/.config/opencode/opencode.json
    if command -v bashio &> /dev/null; then
        bashio::log.info "Created default OpenCode configuration"
    fi
fi

# Performance: Set Node.js options for better memory management
export NODE_OPTIONS="--max-old-space-size=256"

if command -v bashio &> /dev/null; then
    bashio::log.info "Starting ttyd on port 8099..."
else
    echo "[INFO] Starting ttyd on port 8099..."
fi

# Start ttyd with OpenCode session wrapper
# -W: Writable (allow input)
# -p: Port for ingress
# -t: Terminal options
# Using Catppuccin Mocha theme for modern look
exec ttyd \
    -W \
    -p 8099 \
    -t fontSize=14 \
    -t fontFamily="'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Consolas, monospace" \
    -t cursorBlink=true \
    -t 'theme={"background":"#1e1e2e","foreground":"#cdd6f4","cursor":"#f5e0dc","cursorAccent":"#1e1e2e","selectionBackground":"#585b70","selectionForeground":"#cdd6f4","black":"#45475a","red":"#f38ba8","green":"#a6e3a1","yellow":"#f9e2af","blue":"#89b4fa","magenta":"#f5c2e7","cyan":"#94e2d5","white":"#bac2de","brightBlack":"#585b70","brightRed":"#f38ba8","brightGreen":"#a6e3a1","brightYellow":"#f9e2af","brightBlue":"#89b4fa","brightMagenta":"#f5c2e7","brightCyan":"#94e2d5","brightWhite":"#a6adc8"}' \
    /usr/local/bin/opencode-session.sh
