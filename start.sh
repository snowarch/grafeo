#!/bin/bash
# Start SpacetimeDB and the Grafeo system

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPACETIME_BIN="$HOME/.local/bin/spacetime"

echo "=== Grafeo — Deep Code Intelligence ==="
echo ""

# Check SpacetimeDB
if ! command -v "$SPACETIME_BIN" &>/dev/null && ! command -v spacetime &>/dev/null; then
  echo "❌ SpacetimeDB CLI not found."
  echo "   Install: curl -sSf https://install.spacetimedb.com | sh"
  exit 1
fi

SPACETIME=${SPACETIME_BIN:-spacetime}

# Start SpacetimeDB if not running
if ! curl -s http://127.0.0.1:3000/v1/ping &>/dev/null; then
  echo "Starting SpacetimeDB..."
  $SPACETIME start &
  sleep 3
  echo "SpacetimeDB started."
else
  echo "SpacetimeDB already running."
fi

# Check if module is published
DB_NAME="${SPACETIMEDB_DB:-grafeo}"
echo ""
echo "Checking module '$DB_NAME'..."

if $SPACETIME logs "$DB_NAME" &>/dev/null 2>&1; then
  echo "✅ Module '$DB_NAME' is published."
else
  echo "Module not published. Publishing..."
  $SPACETIME publish "$DB_NAME" --module-path "$SCRIPT_DIR/spacetimedb"
  if [ $? -eq 0 ]; then
    echo "✅ Module published successfully."
  else
    echo "❌ Failed to publish module."
    echo "   Try: spacetime publish $DB_NAME --clear-database -y --module-path $SCRIPT_DIR/spacetimedb"
    exit 1
  fi
fi

echo ""
echo "=== Ready ==="
echo ""
echo "Commands:"
echo "  npx tsx src/cli.ts init .        # Initialize in a project"
echo "  npx tsx src/cli.ts index .       # Index the project"
echo "  npx tsx src/cli.ts serve         # Start MCP server"
echo "  npx tsx src/cli.ts setup windsurf # Configure Windsurf"
echo ""
