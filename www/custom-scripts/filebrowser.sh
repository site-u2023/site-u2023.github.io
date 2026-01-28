#!/bin/sh

SCRIPT_VERSION="R8.0128.1048"

# =============================================================================
# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS
# =============================================================================

SERVICE_NAME="filebrowser"
INSTALL_DIR="/usr/bin"
CONFIG_DIR="/etc/filebrowser"
DB_FILE="${CONFIG_DIR}/filebrowser.db"

# =============================================================================
# Utility Functions
# =============================================================================

print_msg() { printf "\033[1;34m%s\033[0m\n" "$1"; }
print_ok()  { printf "\033[1;32m%s\033[0m\n" "$1"; }
print_err() { printf "\033[1;31m%s\033[0m\n" "$1"; }
print_warn(){ printf "\033[1;33m%s\033[0m\n" "$1"; }

detect_arch() {
    case "$(uname -m)" in
        aarch64|arm64) echo "arm64" ;;
        armv7l)        echo "armv7" ;;
        armv6l)        echo "armv6" ;;
        x86_64|amd64)  echo "amd64" ;;
        i386|i686)     echo "386" ;;
        riscv64)       echo "riscv64" ;;
        *) print_err "Unsupported architecture: $(uname -m)"; return 1 ;;
    esac
}

# =============================================================================
# Install Functions
# =============================================================================

install_filebrowser() {
    local arch ver tar_file url dest
    
    arch=$(detect_arch) || return 1
    print_msg "Detected architecture: $arch"
    
    # Get latest version from GitHub API
    ver=$(wget -qO- "https://api.github.com/repos/filebrowser/filebrowser/releases/latest" 2>/dev/null | \
          jsonfilter -e '@.tag_name' 2>/dev/null | sed 's/^v//')
    [ -z "$ver" ] && ver="2.31.2"
    
    tar_file="linux-${arch}-filebrowser.tar.gz"
    url="https://github.com/filebrowser/filebrowser/releases/download/v${ver}/${tar_file}"
    dest="/tmp/${tar_file}"
    
    print_msg "Downloading filebrowser v${ver}..."
    if ! wget -qO "$dest" "$url" 2>/dev/null; then
        wget --no-check-certificate -qO "$dest" "$url" 2>/dev/null || {
            print_err "Download failed"
            return 1
        }
    fi
    
    cd /tmp || return 1
    tar -xzf "$tar_file" filebrowser || { print_err "Extract failed"; return 1; }
    mv filebrowser "$INSTALL_DIR/" || { print_err "Move failed"; return 1; }
    chmod +x "$INSTALL_DIR/filebrowser"
    rm -f "$dest"
    
    print_ok "Filebrowser v${ver} installed"
}

configure_filebrowser() {
    mkdir -p "$CONFIG_DIR"
    
    # Initialize DB only if not exists
    if [ ! -f "$DB_FILE" ]; then
        print_msg "Initializing database..."
        filebrowser config init --database "$DB_FILE" >/dev/null 2>&1
        filebrowser users add "$FB_USER" "$FB_PASS" --perm.admin --database "$DB_FILE" >/dev/null 2>&1
    fi
    
    # Update config
    filebrowser config set \
        --database "$DB_FILE" \
        --root "$FB_ROOT" \
        --address "0.0.0.0" \
        --port "$FB_PORT" \
        --locale "$FB_LANG" \
        >/dev/null 2>&1
    
    print_ok "Configuration completed"
}

create_init_script() {
    cat > "/etc/init.d/$SERVICE_NAME" << 'INITEOF'
#!/bin/sh /etc/rc.common
START=99
STOP=10
USE_PROCD=1

start_service() {
    local db="/etc/filebrowser/filebrowser.db"
    [ ! -f "$db" ] && return 1
    
    procd_open_instance
    procd_set_param command /usr/bin/filebrowser --database "$db"
    procd_set_param respawn
    procd_close_instance
}

stop_service() {
    killall filebrowser 2>/dev/null || true
}
INITEOF
    chmod +x "/etc/init.d/$SERVICE_NAME"
    print_ok "Init script created"
}

show_access_info() {
    local lan_ip
    lan_ip=$(ip -4 addr show br-lan 2>/dev/null | awk '/inet / {sub(/\/.*/, "", $2); print $2; exit}')
    [ -z "$lan_ip" ] && lan_ip="192.168.1.1"
    
    printf "\n"
    print_ok "=== Filebrowser Access ==="
    print_ok "URL: http://${lan_ip}:${FB_PORT}/"
    print_ok "User: ${FB_USER}"
    print_ok "Pass: ${FB_PASS}"
    print_warn "Change password after first login!"
}

# =============================================================================
# Remove Functions
# =============================================================================

remove_filebrowser() {
    if ! command -v filebrowser >/dev/null 2>&1; then
        print_err "Filebrowser not installed"
        return 1
    fi
    
    if [ "$REMOVE_MODE" != "auto" ] && [ "$TUI_MODE" != "1" ]; then
        printf "Remove filebrowser? (y/N): "
        read -r confirm
        case "$confirm" in [yY]*) ;; *) print_warn "Cancelled"; return 0 ;; esac
    fi
    
    "/etc/init.d/$SERVICE_NAME" stop 2>/dev/null
    "/etc/init.d/$SERVICE_NAME" disable 2>/dev/null
    rm -f "$INSTALL_DIR/filebrowser"
    rm -f "/etc/init.d/$SERVICE_NAME"
    rm -rf "$CONFIG_DIR"
    
    print_ok "Filebrowser removed"
}

# =============================================================================
# Main
# =============================================================================

show_usage() {
    cat << EOF
Usage: $0 [options]
Options:
  -i        Install filebrowser
  -r [auto] Remove filebrowser (auto=no confirmation)
  -t        TUI mode (internal use)
  -h        Show this help
Environment:
  FB_USER   Username (default: admin)
  FB_PASS   Password (default: admin12345678)
  FB_PORT   Web port (default: 8080)
  FB_ROOT   Root path (default: /)
EOF
}

filebrowser_main() {
    local action=""
    
    while getopts "ir:th" opt; do
        case "$opt" in
            i) action="install" ;;
            r) action="remove"; REMOVE_MODE="${OPTARG:-manual}" ;;
            t) TUI_MODE="1" ;;
            h) show_usage; exit 0 ;;
            *) show_usage; exit 1 ;;
        esac
    done
    
    # TUI mode: determine action from SELECTED_OPTION
    if [ "$TUI_MODE" = "1" ] && [ -z "$action" ]; then
        case "$SELECTED_OPTION" in
            install) action="install" ;;
            remove)  action="remove" ;;
            *)
                [ -n "$REMOVE_MODE" ] && action="remove" || action="install"
                ;;
        esac
    fi
    
    case "$action" in
        install)
            if command -v filebrowser >/dev/null 2>&1; then
                print_warn "Already installed"
                show_access_info
                return 0
            fi
            install_filebrowser || return 1
            configure_filebrowser || return 1
            create_init_script
            "/etc/init.d/$SERVICE_NAME" enable 2>/dev/null
            "/etc/init.d/$SERVICE_NAME" start 2>/dev/null
            show_access_info
            ;;
        remove)
            remove_filebrowser
            ;;
        *)
            # Interactive mode
            if command -v filebrowser >/dev/null 2>&1; then
                print_warn "Filebrowser already installed"
                remove_filebrowser
            else
                printf "Install filebrowser? (y/N): "
                read -r confirm
                case "$confirm" in
                    [yY]*)
                        install_filebrowser || exit 1
                        configure_filebrowser || exit 1
                        create_init_script
                        "/etc/init.d/$SERVICE_NAME" enable 2>/dev/null
                        "/etc/init.d/$SERVICE_NAME" start 2>/dev/null
                        show_access_info
                        ;;
                    *) print_warn "Cancelled" ;;
                esac
            fi
            ;;
    esac
}

if [ "$(basename "$0")" = "filebrowser.sh" ]; then
    filebrowser_main "$@"
fi
