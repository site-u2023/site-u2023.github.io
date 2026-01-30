# AdGuard Home Installation Script (MAP-E / DS-Lite Support) - Technical Specification

## Quick Start

The script can be downloaded and executed with the following one-liner:
```bash
mkdir -p /tmp && wget --no-check-certificate -O /tmp/adguardhome.sh "https://site-u.pages.dev/www/custom-scripts/adguardhome.sh" && chmod +x /tmp/adguardhome.sh && sh /tmp/adguardhome.sh
```

This command executes the following steps sequentially:

1. Create `/tmp` directory (skip if exists)
2. Download the script (SSL certificate verification disabled)
3. Grant execution permission
4. Execute the script

Interactive prompts for installation mode and credential input will appear. For non-interactive execution, add options:
```bash
sh /tmp/adguardhome.sh -i official
```

Refer to the "Usage Examples" section for detailed usage instructions.

## File Locations

Files related to this script are managed in the following repository.

### Executable

[adguardhome.sh](https://github.com/site-u2023/site-u2023.github.io/blob/main/www/custom-scripts/adguardhome.sh)

The main script. All functionality is implemented in this single file.

### Configuration File Template

[adguardhome.yaml](https://github.com/site-u2023/site-u2023.github.io/blob/main/www/custom-scripts/adguardhome.yaml)

YAML configuration file template. The script downloads this file from the URL specified by the `SCRIPT_BASE_URL` environment variable and replaces placeholders with actual values. The default download source is `https://site-u.pages.dev/www/custom-scripts/adguardhome.yaml`.

### Technical Specification

[AdGuardHome.md](https://github.com/site-u2023/site-u2023.github.io/blob/main/www/custom-scripts/AdGuardHome.md)

This document. Contains detailed specifications, behavior, and usage instructions for the script.

## Synopsis
```
adguardhome.sh [-c] [-n] [-r <mode>] [-i <source>]
```

## Options

**-c**

Disable system resource check. Equivalent to environment variable `SKIP_RESOURCE_CHECK=1`.

**-n**

Disable automatic YAML configuration file generation. Equivalent to environment variable `NO_YAML=1`. In this case, initial setup via the web interface (default port 3000) is required.

**-m**

Credential update mode. Updates the username, password, and web port number of an existing AdGuard Home installation. Equivalent to environment variable `UPDATE_CREDENTIALS=1`.

**-r** *mode*

Specify removal mode. Environment variable `REMOVE_MODE` takes precedence.

- **auto** - Automatic removal without confirmation. Configuration files are also automatically deleted.
- **manual** - Interactive removal with confirmation. Confirmation is requested twice: before removal execution and before configuration file deletion.

**-i** *source*

Specify installation source. Environment variable `INSTALL_MODE` takes precedence.

- **openwrt** - OpenWrt repository package
- **official** - GitHub official binary

**-t**

TUI mode (internal use). Used during integrated mode execution.

**-h**

Display usage information and exit.

Options can be specified in any order.

## Environment Variables

Environment variable control is primarily intended for integrated execution from other scripts. Command-line options are recommended for standalone execution. When command-line options are specified, corresponding environment variable values are ignored.

**INSTALL_MODE**

Specify installation source. Can be set to `openwrt` or `official`. Overridden by command-line option `-i`.

**NO_YAML**

When set to `1`, disables YAML auto-generation. Equivalent to command-line option `-n`.

**UPDATE_CREDENTIALS**

When set to `1`, runs in credential update mode. Equivalent to command-line option `-m`.

**REMOVE_MODE**

Specify removal mode. Can be set to `auto` or `manual`. Overridden by command-line option `-r`.

**AGH_USER**

Specify administrator username. Default value is `admin`. Only effective when `NO_YAML` is not set.

**AGH_PASS**

Specify administrator password. Default value is `password`, minimum 8 characters. Only effective when `NO_YAML` is not set. Hashed using bcrypt algorithm.

Note: The default value `password` is weak and must be changed in production environments.

**WEB_PORT**

Specify web interface port number. Default value is `8000`. Only effective when `NO_YAML` is not set. When `NO_YAML=1`, AdGuard Home uses port 3000 by default.

**DNS_PORT**

Specify DNS service port number. Default value is `53`. Only effective when `NO_YAML` is not set.

**DNS_BACKUP_PORT**

Specify backup dnsmasq port number. Default value is `54`. Only effective when `NO_YAML` is not set.

**LAN_ADDR**

Specify LAN interface IPv4 address. Auto-detected when not set.

**SCRIPT_BASE_URL**

Specify YAML template download source URL. Default value is `https://site-u.pages.dev/www/custom-scripts`.

**SKIP_RESOURCE_CHECK**

When set to `1`, disables system resource check. Equivalent to command-line option `-c`.

**TUI_MODE**

When set to `1`, runs in TUI (integrated) mode. Equivalent to command-line option `-t`.

## YAML Configuration File Specification (Custom Specification)

When `-n` option or `NO_YAML=1` is not specified, this script retrieves a template from `https://site-u.pages.dev/www/custom-scripts/adguardhome.yaml` and generates `AdGuardHome.yaml` by replacing the following placeholders with environment variable values.

| Placeholder             | Replaced Value                  | Default Value |
|-------------------------|--------------------------------|---------------|
| `{{AGH_USER}}`          | Administrator username          | `admin`       |
| `{{AGH_PASS_HASH}}`     | bcrypt hashed password          | (input value) |
| `{{WEB_PORT}}`          | Web admin panel port            | `8000`        |
| `{{DNS_PORT}}`          | DNS service port                | `53`          |
| `{{DNS_BACKUP_PORT}}`   | dnsmasq backup port             | `54`          |
| `{{NTP_DOMAIN}}`        | NTP server domain               | (obtained from system settings, line removed if not set) |

### http Section
```yaml
http:
  address: 0.0.0.0:{{WEB_PORT}}
```

### users Section
```yaml
users:
  - name: {{AGH_USER}}
    password: {{AGH_PASS_HASH}}
```

### dns Section
```yaml
dns:
  port: {{DNS_PORT}}
  refuse_any: true
  upstream_dns:
    - '# LAN domain intercept'
    - '[/lan/]127.0.0.1:{{DNS_BACKUP_PORT}}'
    - '# NTP service'
    - '[/{{NTP_DOMAIN}}/]2606:4700:4700::1111'
    - '[/{{NTP_DOMAIN}}/]1.1.1.1'
    - '# DNS-over-QUIC'
    - quic://unfiltered.adguard-dns.com
    - quic://dns.nextdns.io
    - '# DNS-over-TLS'
    - tls://unfiltered.adguard-dns.com
    - tls://one.one.one.one
    - tls://dns.google
    - tls://dns10.quad9.net
    - '# DNS-over-HTTPS(coercion HTTP/3)'
    - https://dns.cloudflare.com/dns-query
    - https://dns.google/dns-query
    - https://unfiltered.adguard-dns.com/dns-query
    - https://dns.nextdns.io
    - https://dns10.quad9.net/dns-query
```

### bootstrap_dns Section
```yaml
  bootstrap_dns:
    - 2606:4700:4700::1111
    - 2001:4860:4860::8888
    - 1.1.1.1
    - 8.8.8.8
```

### fallback_dns Section
```yaml
  fallback_dns:
    - https://dns.cloudflare.com/dns-query
    - https://dns.google/dns-query
    - https://unfiltered.adguard-dns.com/dns-query
    - https://dns.nextdns.io/dns-query
    - https://dns10.quad9.net/dns-query
  upstream_mode: parallel
  local_ptr_upstreams:
    - 127.0.0.1:{{DNS_BACKUP_PORT}}
```

### filters Section
```yaml
filters:
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt
    name: AdGuard DNS filter
  - enabled: false
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_2.txt
    name: AdAway Default Blocklist
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_10_Chinese/filter.txt
    name: AdGuard Chinese filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_8_Dutch/filter.txt
    name: AdGuard Dutch filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_5_French/filter.txt
    name: AdGuard French filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_4_German/filter.txt
    name: AdGuard German filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_7_Japanese/filter.txt
    name: AdGuard Japanese filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_3_Russian/filter.txt
    name: AdGuard Russian filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_6_Spanish/filter.txt
    name: AdGuard Spanish/Portuguese filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_9_Turkish/filter.txt
    name: AdGuard Turkish filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_13_Ukrainian/filter.txt
    name: AdGuard Ukrainian filter
  - enabled: false
    url: https://raw.githubusercontent.com/tofukko/filter/master/Adblock_Plus_list.txt
    name: Tofu Filter
```

### user_rules Section
```yaml
user_rules:
  - '# google analytics'
  - '@@||analytics.google.com'
  - '# Major Japanese Services'
  - '@@||amazon.co.jp^$important'
  - '@@||rakuten.co.jp^$important'
  - '@@||yahoo.co.jp^$important'
  - '@@||mercari.com^$important'
  - '@@||zozo.jp^$important'
  - '@@||cookpad.com^$important'
  - '# SNS Related'
  - '@@||twitter.com^$important'
  - '@@||facebook.com^$important'
  - '@@||instagram.com^$important'
  - '@@||messenger.com^$important'
  - '# LINE Related'
  - '@@||line.me^$important'
  - '@@||line-scdn.net^$important'
  - '# Video/Streaming Services'
  - '@@||youtube.com^$important'
  - '@@||nicovideo.jp^$important'
  - '@@||abema.tv^$important'
  - '# General Ad Exclusions'
  - '@@||google-analytics.com^$important'
  - '@@||doubleclick.net^$important'
```

### log Section
```yaml
log:
  file: ""
```

### schema_version
```yaml
schema_version: 29
```

## Non-Interactive Mode Execution

Non-interactive mode execution is possible by specifying all environment variables. When `AGH_USER`, `AGH_PASS`, and `WEB_PORT` are specified, interactive input is not performed.

## System Requirements

This script sets the following values:
```
MINIMUM_MEM="20"
MINIMUM_FLASH="25"
RECOMMENDED_MEM="50"
RECOMMENDED_FLASH="100"
```

If available memory is less than `MINIMUM_MEM`, or free flash storage is less than `MINIMUM_FLASH`, the script exits with an error. The check can be disabled with command-line option `-c` or environment variable `SKIP_RESOURCE_CHECK=1`.

Values below recommended thresholds are displayed as warnings in yellow, but installation continues if minimum values are met.

Reference: This script sets lower thresholds (20MB) considering OpenWrt's constrained environment, but 50MB or more RAM and 100MB or more flash storage are recommended for actual operation. Operation in environments not meeting official requirements is not guaranteed.

## Package Manager Detection

opkg or apk is auto-detected. If neither exists, the script exits with an error.

## Backup and Restore Functionality

The script automatically backs up configuration files under `/etc/config/` during installation. Backup targets are the 2 files `dhcp` and `firewall`, each saved with a `.adguard.bak` extension (e.g., `dhcp.adguard.bak`).

During removal, if backup files exist, settings are automatically restored to their original state. If backup files do not exist, only dnsmasq settings are reset to default values. Backup files are automatically deleted after the removal process completes.

## Installation Behavior Details

### Non-Disruptive Installation

This script adopts a non-disruptive installation approach to maintain network connectivity during installation.

After all configuration changes are committed to the UCI system, dnsmasq, odhcpd, and firewall services are restarted sequentially. Each service restart is executed individually, and in case of failure, restoration from backup is performed. The AdGuard Home service starts after all configuration changes and network service restarts are complete.
This maintains configuration consistency while ensuring reliable rollback capability in case of failure.

### State After Installation Completion

At installation completion, the following state is achieved:

- AdGuard Home service is enabled and started immediately
- dnsmasq, odhcpd, firewall configuration changes are applied and each service restart is complete
- dnsmasq operates on backup port (default 54) and references 127.0.0.1#53 (AdGuard Home) as upstream DNS
- AdGuard Home listens on TCP/UDP port 53 and provides DNS service immediately
- Web interface is available immediately after startup

### Package Update Behavior

At installation start, package manager repository lists are updated.

- For opkg: Executes `opkg update`
- For apk: Executes `apk update`

If the update fails, detailed output is displayed and the script exits with an error.

## Automatic System Configuration Changes

### dnsmasq Configuration

The following configuration changes are executed during installation:

- Disable resolver function (`noresolv='1'`)
- Set cache size to zero (`cachesize='0'`)
- Disable rebind protection (`rebind_protection='0'`)
- Change port number (`port='${DNS_BACKUP_PORT}'`)
- Specify upstream DNS servers (`127.0.0.1#${DNS_PORT}` and `::1#${DNS_PORT}`)
- Local domain settings (`domain='lan'`, `local='/lan/'`, `expandhosts='1'`)

### DHCP Server Configuration

The following DNS server options are set for the LAN interface:

- IPv4: `dhcp_option='6,${NET_ADDR}'`

### Firewall Configuration

Redirect rules are added to capture DNS traffic. The rule name is `adguardhome_dns_${DNS_PORT}`, and `ipv4`, `ipv6`, or `any` is set according to the detected IP address family. Both TCP and UDP protocols are targeted.

During removal, if backup files exist, all settings are restored; if not, only dnsmasq is reset to default settings. In either case, related services (dnsmasq, odhcpd, firewall) are restarted.

## Network Detection and Auto-Configuration

The LAN interface is auto-detected via `ubus call network.interface.lan status`. If detection fails, the script exits with an error.

IPv4 address is obtained via `ip -4 -o addr show dev ${LAN} scope global`. IPv6 global addresses are obtained via `ip -6 -o addr show dev ${LAN} scope global`, excluding temporary addresses. Only addresses matching the regular expression `^(2|fd|fc)` are targeted.

Firewall rule address family is determined based on detection results. If only IPv4 is detected, `ipv4` is set; if only IPv6, `ipv6`; if both exist, `any`. If neither address is detected, firewall configuration is skipped and a warning message is displayed.

## Password Hashing Process

When `NO_YAML` is not set, the administrator password is hashed using the bcrypt algorithm. The `htpasswd` command is required for this process.

The script ensures `htpasswd` availability through the following steps:

1. If an existing `htpasswd` command is functional, no additional installation is executed
2. If `htpasswd` does not exist or is not functional:
   - Install dependency packages (`libaprutil`, `libapr`, `libexpat`, `libuuid1`, `libpcre2`)
   - Check if `apache` package is already installed
   - Install `apache` package to obtain `htpasswd`
   - Only if `apache` was not originally installed, save the `htpasswd` binary and then remove the `apache` package
   - If `apache` was originally installed, the package is preserved

This process protects `apache` if it is an existing system component and cleans up when only needed as a temporary dependency.

If `htpasswd` installation or functionality verification fails, an error message is displayed and processing is aborted.

## Official Binary Installation Behavior

When `INSTALL_MODE=official` is specified, the latest release information is retrieved from the GitHub API and the appropriate binary for the architecture is downloaded.

Supported architectures are as follows:

- `aarch64`, `arm64` → `arm64`
- `armv7l` → `armv7`
- `armv6l` → `armv6`
- `armv5l` → `armv5`
- `x86_64`, `amd64` → `amd64`
- `i386`, `i686` → `386`
- `mips` → `mipsle`
- `mips64` → `mips64le`

If an architecture other than the above is detected, an error message is displayed and the script exits.

The downloaded tarball is extracted to `/etc/AdGuardHome`, and execution permission is granted to the binary. Then, service installation processing is executed via `/etc/AdGuardHome/AdGuardHome -s install`. On failure, an error message is displayed and the script exits.

The service name for official binary installation is `AdGuardHome`, which differs from `adguardhome` for OpenWrt package installation.

## OpenWrt Package Installation Behavior

When `INSTALL_MODE=openwrt` is specified, the `adguardhome` package is installed from the package manager repository.

For opkg, available versions are checked via `opkg list`, and `opkg install adguardhome` is executed. For apk, `apk search adguardhome` and `apk add adguardhome` are executed.

If the package does not exist in the repository, a warning message is displayed and automatic fallback to official binary installation occurs. If a network error occurs, an error message is displayed and the script exits.

The service name for OpenWrt package installation is `adguardhome`.

## Configuration File Path Determination

The configuration file path is automatically determined based on the OS version and package manager.

- OpenWrt 24.10 or later, SNAPSHOT, or APK-based systems: `/etc/adguardhome/adguardhome.yaml`
- OpenWrt 23.05 or earlier: `/etc/adguardhome.yaml`
- Official binary: `/etc/AdGuardHome/AdGuardHome.yaml`

## YAML Configuration File Generation Timing

The YAML configuration file is generated before AdGuard Home package installation. This allows the existing configuration file to be used during package installation, and initial settings are automatically applied.

The generation process flow is as follows:

1. Determine `SERVICE_NAME` according to installation mode (`openwrt` or `official`)
2. Create configuration file destination directory
3. Download template and replace placeholders
4. Execute package or binary installation

## Removal Mode Detailed Behavior

Removal mode is specified via `-r` option or `REMOVE_MODE` environment variable. Command-line option `-r` takes precedence over environment variable `REMOVE_MODE`.

### auto Mode

Skips all confirmation prompts, and configuration files are also automatically deleted.

Before removal execution, a warning message "Auto-removing..." is displayed in yellow.

### manual Mode

Confirmation is requested twice: before removal execution and before configuration file deletion. If input other than `y` or `Y` is entered for confirmation, processing is cancelled and exits normally.

### Removal Process Execution Contents

The following operations are executed sequentially during removal processing:

1. AdGuard Home service detection (detect_adguardhome_service function)
2. Stop and disable service
3. For official binary version: Execute uninstall command
4. For OpenWrt package version: Remove via package manager
5. Delete configuration files (automatic for auto mode, after confirmation otherwise)
6. Restore settings from backup files (if they exist)
7. If backup does not exist: Reset dnsmasq settings to default values
8. Delete firewall rule (`adguardhome_dns_${DNS_PORT}`)
9. Cleanup dependency packages (htpasswd, dependency libraries, ca-bundle)
10. Restart related services (dnsmasq, odhcpd, firewall)

### Dependency Package Cleanup

During removal, dependency packages added during installation are automatically cleaned up. However, if the `apache` package was originally installed on the system, it is protected and not removed.

Cleanup targets:
- `htpasswd` binary
- Dependency libraries (`libaprutil`, `libapr`, `libexpat`, `libuuid1`, `libpcre2`)
- `ca-bundle` package

## Error Handling and Recovery Processing

### System Resource Check

If available memory is less than `MINIMUM_MEM` or free flash storage is less than `MINIMUM_FLASH`, an error message is displayed and the script exits. This check can be disabled with `-c` option or `SKIP_RESOURCE_CHECK=1`.

### Package Manager Update

If package list update via opkg or apk fails, detailed output is displayed and the script exits with an error. Network connection problems or repository failures are the main causes.

### Dependency Package Installation

If `htpasswd` installation fails, an error message is displayed and processing is aborted. This processing is skipped when `NO_YAML=1` is set.

### AdGuard Home Installation

On official binary download failure, service installation failure, or OpenWrt package installation failure, respective error messages are displayed and the script exits. If the OpenWrt package is unavailable, automatic fallback to official binary occurs.

### Service Restart

If dnsmasq, odhcpd, or firewall restart fails, an error message is displayed and the script exits.

### LAN Interface Detection

If LAN interface detection via `ubus` fails, an error message is displayed and the script exits. This may occur when executed in non-OpenWrt environments.

## Web Interface Information Display

At installation completion, access information is displayed in the following format. This display is processed by the `get_access` function.

### Port Number Retrieval

Web interface port number is determined in the following priority order:

1. Retrieved from the `address:` field in the `http:` section of the YAML configuration file (`/etc/AdGuardHome/AdGuardHome.yaml`, `/etc/adguardhome/adguardhome.yaml`, or `/etc/adguardhome.yaml`)
2. If the configuration file does not exist or cannot be read, the value of environment variable `WEB_PORT` is used

### IPv4 Access URL

Displayed in the format `http://${NET_ADDR}:${WEB_PORT}/`.

### IPv6 Access URL

If IPv6 global addresses are detected, displayed in the format `http://[${NET_ADDR6}]:${WEB_PORT}/`. If multiple IPv6 addresses exist, only the first address is displayed.

### Authentication Information

When `NO_YAML` is not set, administrator username (`AGH_USER`) and password (`AGH_PASS`) are highlighted in green and yellow.

When `NO_YAML=1`, authentication information is not displayed; instead, a "Configure via web interface" message and default setup URL (`http://${NET_ADDR}:3000/`) are displayed.

### QR Code Generation

In environments where the `qrencode` command is available, QR codes corresponding to IPv4 and IPv6 access URLs are automatically generated. QR codes are displayed directly in the terminal in UTF-8 format, version 3, facilitating access from mobile devices.

## Usage Examples

The official interface for this script is command-line options. Control via environment variables is technically possible but is an implementation detail primarily intended for integrated execution from other scripts and is not recommended for normal use.

### Interactive Installation

Running without options prompts for interactive installation mode selection and credential input.
```bash
sh adguardhome.sh
```

### Installation from Official Binary
```bash
sh adguardhome.sh -i official
```

Prompts for username, password, and web port number at runtime.

### Installation from OpenWrt Package
```bash
sh adguardhome.sh -i openwrt
```

If the package does not exist in the repository, automatic fallback to official binary occurs.

### Credential Update
```bash
sh adguardhome.sh -m
```

Interactively updates username, password, and web port number of an existing installation.

### Skip YAML Generation
```bash
sh adguardhome.sh -i official -n
```

Skips automatic configuration file generation and performs initial setup via web interface (default port 3000).

### Disable System Resource Check
```bash
sh adguardhome.sh -i official -c
```

Skips memory and storage minimum requirement checks.

### Automatic Removal
```bash
sh adguardhome.sh -r auto
```

Executes removal without confirmation prompts. Configuration files are also automatically deleted.

### Interactive Removal
```bash
sh adguardhome.sh -r manual
```

Confirmation prompts are displayed twice: before removal execution and before configuration file deletion.

### Combined Options
```bash
sh adguardhome.sh -i official -c -n
```

Multiple options can be specified simultaneously. Options can be specified in any order.

### TUI Integration Mode
```bash
sh adguardhome.sh -t -i official
```

Mode for integrated execution from other scripts.

### Display Usage
```bash
sh adguardhome.sh -h
```

Displays option list and usage instructions.

## Standalone Mode and Integration Mode

Script behavior varies depending on execution context.

### Standalone Mode

Executed as standalone mode when `$(basename "$0")` matches `adguardhome.sh`.

### Integration Mode

Operates in integration mode when loaded from other scripts via `source` or `.`. In this mode, all behavior can be controlled via environment variables. Designed for external control.

## Differences from Official OpenWrt Documentation

### Router Self-DNS Resolution (Bug Fix)

The official OpenWrt AdGuard Home documentation instructs users to bind the Admin Web Interface to `192.168.1.1:3000` during initial setup. This configuration has a critical limitation:

**Problem:**
- The web interface becomes inaccessible from IPv6 clients
- Access is restricted to IPv4 only

**Solution:**
This script uses `0.0.0.0:{{WEB_PORT}}` in the YAML configuration template, which binds to all available network interfaces (both IPv4 and IPv6). This ensures:
- ✓ IPv4 client access
- ✓ IPv6 client access  
- ✓ All router interfaces

The interface remains secure as it is restricted to the LAN zone by the firewall configuration.
