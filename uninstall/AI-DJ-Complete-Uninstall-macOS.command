#!/usr/bin/env bash
set -u

echo "AI DJ complete uninstaller"
echo "This removes the app, saved settings, cookies, API keys, cache, logs, and shortcuts on this macOS account."
echo "It does not remove files outside AI DJ's known app and data folders."
echo

if [[ "${1:-}" != "--force" ]]; then
  read -r -p "Type REMOVE to continue: " confirm
  if [[ "$confirm" != "REMOVE" ]]; then
    echo "Canceled."
    exit 0
  fi
fi

echo
echo "==> Stopping AI DJ"
pkill -f "AI DJ" 2>/dev/null || true
pkill -f "AI.DJ" 2>/dev/null || true

remove_path() {
  local target="$1"
  if [[ -e "$target" || -L "$target" ]]; then
    echo "Removing: $target"
    rm -rf "$target"
  fi
}

echo
echo "==> Removing app, settings, cache, logs, and preferences"
remove_path "/Applications/AI DJ.app"
remove_path "$HOME/Applications/AI DJ.app"
remove_path "$HOME/Library/Application Support/AI DJ"
remove_path "$HOME/Library/Application Support/AI.DJ"
remove_path "$HOME/Library/Application Support/ai-dj"
remove_path "$HOME/Library/Caches/AI DJ"
remove_path "$HOME/Library/Caches/AI.DJ"
remove_path "$HOME/Library/Caches/com.mmmccc49.aidj"
remove_path "$HOME/Library/Logs/AI DJ"
remove_path "$HOME/Library/Logs/AI.DJ"
remove_path "$HOME/Library/Preferences/com.mmmccc49.aidj.plist"
remove_path "$HOME/Desktop/AI DJ.app"

echo
echo "AI DJ complete uninstall finished."
echo "If macOS says some files are still in use, restart the computer and run this tool again."
read -r -p "Press Enter to close..."
