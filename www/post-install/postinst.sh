#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2154,SC2086,SC3001,SC3043

# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

BASE_DIR="/tmp"
CONFIG_DIR="$BASE_DIR/aios2"
exec >> "$CONFIG_DIR/debug.log" 2>&1

[ -n "$INSTALL_CMD" ] && eval "$INSTALL_CMD"

exit 0
