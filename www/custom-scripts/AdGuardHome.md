# AdGuard Home Installation Script - Technical Specification

## Quick Start

The script can be downloaded and executed with the following one-liner command.
```bash
mkdir -p /tmp && wget --no-check-certificate -O /tmp/adguardhome.sh "https://site-u.pages.dev/www/custom-scripts/adguardhome.sh" && chmod +x /tmp/adguardhome.sh && sh /tmp/adguardhome.sh
```

This command executes the following operations sequentially.

1. Creates the `/tmp` directory (skipped if already exists)
2. Downloads the script (SSL certificate verification disabled)
3. Grants execution permissions
4. Executes the script

The script will prompt for installation mode selection and credential input interactively. For non-interactive execution, specify options as additional arguments.
```bash
sh /tmp/adguardhome.sh -i official
```

For detailed usage instructions, refer to the Usage Examples section.

## File Location

The files related to this script are maintained in the following repository.

### Executable File

[adguardhome.sh](https://github.com/site-u2023/site-u2023.github.io/blob/main/www/custom-scripts/adguardhome.sh)

This is the main script file. All functionality is implemented in this single file.

### Configuration File Template

[adguardhome.yaml](https://github.com/site-u2023/site-u2023.github.io/blob/main/www/custom-scripts/adguardhome.yaml)

This is the YAML configuration file template. The script downloads this file from the URL specified by the environment variable `SCRIPT_BASE_URL`, replaces placeholders with actual values, and uses it. The default download location is `https://site-u.pages.dev/www/custom-scripts/adguardhome.yaml`.

### Technical Specification Document

[AdGuardHome.md](https://github.com/site-u2023/site-u2023.github.io/blob/main/www/custom-scripts/AdGuardHome.md)

This is the present document. It provides detailed information on the script's specifications, behavior, and usage methods.

## Syntax
```
adguardhome.sh [-c] [-n] [-r <mode>] [-i <source>] [-m] [-t] [-h]
```

## Options

**-c**

Disables system resource checking. Equivalent to setting the environment variable `SKIP_RESOURCE_CHECK=1`.

**-n**

Disables automatic generation of YAML configuration file. Equivalent to setting the environment variable `NO_YAML=1`. In this case, initial setup via the web interface (default port 3000) is required.

**-m**

Credential update mode. Updates the username, password, and web port number of an existing AdGuard Home installation. Equivalent to setting the environment variable `UPDATE_CREDENTIALS=1`.

**-r** *mode*

Specifies the removal mode. The environment variable `REMOVE_MODE` takes precedence if specified.

- **auto** - Automatic removal without confirmation. Configuration files are also automatically deleted.
- **manual** - Removal after interactive confirmation. Confirmation is requested twice: before removal execution and before configuration file deletion.

**-i** *source*

Specifies the installation source. The environment variable `INSTALL_MODE` takes precedence if specified.

- **openwrt** - OpenWrt repository package
- **official** - GitHub official binary

**-t**

TUI mode (internal use). Used when executing in integrated mode. Equivalent to setting the environment variable `TUI_MODE=1`.

**-h**

Displays usage information and exits.

The order of option specification is arbitrary.

## Environment Variables

Environment variables for controlling behavior are primarily intended for integrated execution from other scripts. For standalone execution, the use of command line options is recommended. When command line options are specified, the values of corresponding environment variables are ignored.

**INSTALL_MODE**

Specifies the installation source. The values `openwrt` or `official` can be set. Command line option `-i` takes precedence.

**NO_YAML**

Disables automatic YAML generation when set to `1`. Equivalent to command line option `-n`.

**UPDATE_CREDENTIALS**

Executes in credential update mode when set to `1`. Equivalent to command line option `-m`.

**REMOVE_MODE**

Specifies the removal mode. The values `auto` or `manual` can be set. Command line option `-r` takes precedence.

**AGH_USER**

Specifies the administrator username. The default value is `admin`. Valid only when `NO_YAML` is not set.

**AGH_PASS**

Specifies the administrator password. The default value is `password`, with a minimum length of 8 characters. Valid only when `NO_YAML` is not set. The password is hashed using the bcrypt algorithm.

Note: The default value `password` is weak and must be changed in production environments.

**WEB_PORT**

Specifies the web interface port number. The default value is `8000`. Valid only when `NO_YAML` is not set. When `NO_YAML=1`, AdGuard Home uses port 3000 by default.

**DNS_PORT**

Specifies the DNS service port number. The default value is `53`. Valid only when `NO_YAML` is not set.

**DNS_BACKUP_PORT**

Specifies the backup dnsmasq port number. The default value is `54`. Valid only when `NO_YAML` is not set.

**LAN_ADDR**

Specifies the LAN interface IPv4 address. Automatically detected when not set.

**SCRIPT_BASE_URL**

Specifies the URL for downloading the YAML template. The default value is `https://site-u.pages.dev/www/custom-scripts`.

**SKIP_RESOURCE_CHECK**

Disables system resource checking when set to `1`. Equivalent to command line option `-c`.

**TUI_MODE**

Executes in TUI (integrated) mode when set to `1`. Equivalent to command line option `-t`. In this case, reboot prompts are suppressed.

## YAML Configuration File Specification (Custom Specification)

When the `-n` option or `NO_YAML=1` is not specified, the script retrieves a template from `https://site-u.pages.dev/www/custom-scripts/adguardhome.yaml`, replaces the following placeholders with environment variable values, and generates `AdGuardHome.yaml`.

| Placeholder           | Replaced Value                    | Default Value |
|-----------------------|-----------------------------------|---------------|
| `{{AGH_USER}}`        | Administrator username            | `admin`       |
| `{{AGH_PASS_HASH}}`   | bcrypt hashed password            | (input value) |
| `{{WEB_PORT}}`        | Web management interface port     | `8000`        |
| `{{DNS_PORT}}`        | DNS service port                  | `53`          |
| `{{DNS_BACKUP_PORT}}` | dnsmasq backup port               | `54`          |

### schema_version
```yaml
schema_version: 29
```

### http Section
```yaml
http:
  address: 0.0.0.0:{{WEB_PORT}}
  session_ttl: 720h
```

### users Section
```yaml
users:
  - name: {{AGH_USER}}
    password: {{AGH_PASS_HASH}}
auth_attempts: 5
block_auth_min: 15
```

### dns Section
```yaml
dns:
  port: {{DNS_PORT}}
  refuse_any: true
  upstream_dns:
    - '# LAN domain intercept'
    - '[/lan/]127.0.0.1:54'
    - '# NTP service'
    - '[/*.pool.ntp.org/]1.1.1.1'
    - '[/*.pool.ntp.org/]1.0.0.1'
    - '[/*.pool.ntp.org/]2606:4700:4700::1111'
    - '[/*.pool.ntp.org/]2606:4700:4700::1001'
    - '# DNS-over-QUIC'
    - quic://unfiltered.adguard-dns.com
    - '# DNS-over-TLS'
    - tls://1dot1dot1dot1.cloudflare-dns.com
    - tls://dns.google
    - tls://jp.tiar.app
    - tls://dns.nextdns.io
    - '# DNS-over-HTTPS(coercion HTTP/3)'
    - h3://cloudflare-dns.com/dns-query
    - h3://dns.google/dns-query
    - h3://unfiltered.adguard-dns.com/dns-query
    - h3://jp.tiarap.org/dns-query
    - h3://dns.nextdns.io
```

### bootstrap_dns Section
```yaml
  bootstrap_dns:
    - 1.1.1.1
    - 1.0.0.1
    - 8.8.8.8
    - 8.8.4.4
    - 172.104.93.80
    - 129.250.35.250
    - 129.250.35.251
    - 2606:4700:4700::1111
    - 2606:4700:4700::1001
    - 2001:4860:4860::8888
    - 2001:4860:4860::8844
    - 2400:8902::f03c:91ff:feda:c514
    - 2001:418:3ff::53
    - 2001:418:3ff::1:53
```

### fallback_dns Section
```yaml
  fallback_dns:
    - https://cloudflare-dns.com/dns-query
    - https://dns.google/dns-query
    - https://unfiltered.adguard-dns.com/dns-query
    - https://jp.tiar.app/dns-query
    - https://dns.nextdns.io
  cache_size: 1048576
  enable_dnssec: false
  use_private_ptr_resolvers: true
  local_ptr_upstreams:
    - 127.0.0.1:{{DNS_BACKUP_PORT}}
```

### upstream_mode Section
```yaml
  upstream_mode: parallel
```

### tls Section
```yaml
tls:
  enabled: false
```

### filters Section
```yaml
filters:
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt
    name: AdGuard DNS filter
    id: 1
  - enabled: false
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_2.txt
    name: AdAway Default Blocklist
    id: 2
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_7_Japanese/filter.txt
    name: AdGuard Japanese filter
    id: 1764215105
  - enabled: false
    url: https://raw.githubusercontent.com/tofukko/filter/master/Adblock_Plus_list.txt
    name: 豆腐フィルタ
    id: 1764215106
```

### user_rules Section
```yaml
user_rules:
  - '# 日本の主要サービス'
  - '@@||amazon.co.jp^$important'
  - '@@||rakuten.co.jp^$important'
  - '@@||yahoo.co.jp^$important'
  - '# LINE関連'
  - '@@||line.me^$important'
  - '@@||line-scdn.net^$important'
```

### dhcp Section
```yaml
dhcp:
  enabled: false
```

### filtering Section
```yaml
filtering:
  parental_enabled: false
  safebrowsing_enabled: false
```

### log Section
```yaml
log:
  file: ""
```

## Non-Interactive Mode Execution

Non-interactive mode execution is possible by specifying all environment variables. When `AGH_USER`, `AGH_PASS`, and `WEB_PORT` are specified, interactive input is not executed.

## System Requirements

The script sets the following values.
```
MINIMUM_MEM="20"
MINIMUM_FLASH="25"
RECOMMENDED_MEM="50"
RECOMMENDED_FLASH="100"
```

The script terminates with an error if available memory falls below `MINIMUM_MEM` or free flash storage falls below `MINIMUM_FLASH`. The check can be disabled with command line option `-c` or environment variable `SKIP_RESOURCE_CHECK=1`.

If values fall below the recommended values, they are displayed in yellow as a warning, but installation continues if minimum values are met.

Reference: Third-party sources document 256MB RAM as the minimum requirement for AdGuard Home. This script sets a lower threshold (20MB) considering OpenWrt's constrained environments, but for actual operation, 50MB or more of RAM and 100MB or more of flash storage are recommended. Operation in environments that do not meet official requirements is not guaranteed.

## Package Manager Detection

The script automatically detects opkg or apk. If neither exists, it terminates with an error.

## Backup and Restore Functionality

The script automatically backs up configuration files under `/etc/config/` during installation. The backup targets are three files: `network`, `dhcp`, and `firewall`, which are saved with the `.adguard.bak` extension appended.

When backup files exist during removal, they are automatically restored to the original configuration. If backup files do not exist, only the dnsmasq configuration is reset to default values. Backup files are automatically deleted after the removal process is completed.

## Automatic System Configuration Changes

### dnsmasq Configuration

The following configuration changes are executed during installation.

- Disables resolver functionality (`noresolv='1'`)
- Sets cache size to zero (`cachesize='0'`)
- Disables rebind protection (`rebind_protection='0'`)
- Changes port number (`port='${DNS_BACKUP_PORT}'`)
- Specifies upstream DNS servers (`127.0.0.1#${DNS_PORT}` and `::1#${DNS_PORT}`)
- Configures local domain settings (`domain='lan'`, `local='/lan/'`, `expandhosts='1'`)

### DHCP Server Configuration

The following DNS server options are configured for the LAN interface.

- IPv4: `dhcp_option='6,${NET_ADDR}'`
- IPv6: `dhcp_option6="option6:dns=[${NET_ADDR6}]"` (all detected global addresses)

### Firewall Configuration

Redirect rules for capturing DNS traffic are added. The rule name is `adguardhome_dns_${DNS_PORT}`, with `ipv4`, `ipv6`, or `any` set according to the detected IP address family. Both TCP and UDP protocols are targeted.

During removal, all configurations are restored if backup files exist, or only dnsmasq is reset to default configuration if backup files do not exist. In either case, related services (dnsmasq, odhcpd, firewall) are restarted.

## Network Detection and Automatic Configuration

The LAN interface is automatically detected by `ubus call network.interface.lan status`. The process terminates with an error if detection fails.

The IPv4 address is obtained by `ip -4 -o addr show dev ${LAN} scope global`. IPv6 global addresses are obtained by `ip -6 -o addr show dev ${LAN} scope global`, with temporary addresses excluded. Only addresses matching the regular expression `^(2|fd|fc)` are targeted.

The address family for firewall rules is determined based on the detection results. `ipv4` is set if only IPv4 is detected, `ipv6` if only IPv6, and `any` if both exist. If no addresses can be detected, firewall configuration is skipped and a warning message is displayed.

## Certificate Package Installation

Certificate packages are automatically installed to perform downloads via HTTPS. The target is `ca-bundle` if the package manager is opkg, or `ca-certificates` if apk. This installation process is not rolled back during removal.

## Password Hashing Process

When `NO_YAML` is not set, the administrator password is hashed with the bcrypt algorithm. The `htpasswd` command is required for this process, and the script temporarily installs `apache` as a dependency package.

The processing procedure is as follows.

1. Checks if `apache` was originally installed
2. If `htpasswd` does not exist, installs the `apache` package
3. Grants execution permissions to `/usr/bin/htpasswd`
4. Removes only the `apache` package if it was not originally installed (preserves htpasswd binary)
5. Keeps the `apache` package if it was originally installed

This process protects `apache` when it is an existing system component, and performs cleanup when it is only needed as a temporary dependency.

An error message is displayed and processing is interrupted if `htpasswd` installation fails.

## Official Binary Installation Behavior

When `INSTALL_MODE=official` is specified, the latest release information is retrieved from the GitHub API and the appropriate binary for the architecture is downloaded.

Supported architectures are as follows.

- `aarch64`, `arm64` → `arm64`
- `armv7l` → `armv7`
- `armv6l` → `armv6`
- `armv5l` → `armv5`
- `x86_64`, `amd64` → `amd64`
- `i386`, `i686` → `386`
- `mips` → `mipsle`
- `mips64` → `mips64le`

An error message is displayed and the process terminates if an architecture other than the above is detected.

The downloaded tarball is extracted to `/etc/AdGuardHome`, and execution permissions are granted to the binary. Subsequently, service installation processing is executed by `/etc/AdGuardHome/AdGuardHome -s install`. An error message is displayed and the process terminates on failure.

The service name for official binary installation is `AdGuardHome`, which differs from `adguardhome` for OpenWrt package installation.

## OpenWrt Package Installation Behavior

When `INSTALL_MODE=openwrt` is specified, the `adguardhome` package is installed from the package manager's repository.

If the package manager is opkg, available versions are checked with `opkg list`, and `opkg install --verbosity=0 adguardhome` is executed. For apk, `apk search adguardhome` and `apk add adguardhome` are executed.

If the package does not exist in the repository, a warning message is displayed and the script automatically falls back to official binary installation. An error message is displayed and the process terminates if a network error occurs.

The service name for OpenWrt package installation is `adguardhome`.

## Detailed Removal Mode Behavior

Removal mode is specified by the `-r` option or the `REMOVE_MODE` environment variable. Command line option `-r` takes precedence over environment variable `REMOVE_MODE`.

### auto Mode

All confirmation prompts are skipped, and configuration files are automatically deleted. This mode is also used in automatic removal processing during installation errors. Reboot prompts after processing completion are not displayed.

An "Auto-removing..." warning message is displayed in yellow before removal execution.

### manual Mode

User confirmation is requested twice: before removal execution and before configuration file deletion. Processing is cancelled and exits normally if anything other than `y` or `Y` is entered in response to confirmation.

### Behavior When Not Specified

When `REMOVE_MODE` is not set, reboot prompts are displayed after processing completion only when executing in standalone mode (TUI_MODE is not set). The `reboot` command is executed immediately upon pressing the Enter key.

In integrated mode (TUI_MODE is set), reboot prompts are not displayed.

### Removal Process Execution Contents

The removal process executes the following operations sequentially.

1. AdGuard Home service detection (detect_adguardhome_service function)
2. Service stop and disable
3. For official binary version: execution of uninstall command
4. For OpenWrt package version: removal by package manager
5. Configuration file deletion (automatic in auto mode, after confirmation otherwise)
6. Configuration restoration from backup files (if they exist)
7. dnsmasq configuration reset to default values if backups do not exist
8. Firewall rule (`adguardhome_dns_${DNS_PORT}`) deletion
9. Related service (dnsmasq, odhcpd, firewall) restart
10. Reboot prompt display (only in standalone mode and when REMOVE_MODE is not set)

## Installation Behavior Details

### Non-Disruptive Installation

The script adopts a non-disruptive installation approach to maintain network connectivity during installation.

All configuration changes are committed to the UCI system, but service restarts are not executed. The dnsmasq, odhcpd, and firewall services continue operating with existing configurations, and AdGuard Home is activated for the first time on next system boot.

This avoids DNS service interruption during the installation process.

### State After Installation Completion

At the time of installation completion, the state is as follows.

- The AdGuard Home service is enabled but not started (only `/etc/init.d/SERVICE_NAME enable` is executed)
- Configuration changes for dnsmasq, odhcpd, and firewall are committed but not applied
- The existing dnsmasq continues to function as the DNS resolver
- On next reboot, AdGuard Home will listen on TCP/UDP port 53, and dnsmasq will migrate to the backup port (default 54)

### Package Update Behavior

At the start of installation, the package manager's repository list is updated.

- For opkg: executes `opkg update`
- For apk: executes `apk update`

Detailed output is displayed and the process terminates with an error if the update fails.

## Web Interface Information Display

Upon installation completion, access information is displayed in the following format. This display is processed by the `get_access` function.

### Port Number Acquisition

The web interface port number is determined in the following priority order.

1. Retrieved from the `address:` field in the `http:` section of the YAML configuration file (`/etc/AdGuardHome/AdGuardHome.yaml` or `/etc/adguardhome.yaml`)
2. Uses the value of environment variable `WEB_PORT` if the configuration file does not exist or cannot be read

### IPv4 Access URL

Displayed in the format `http://${NET_ADDR}:${WEB_PORT}/`.

### IPv6 Access URL

Displayed in the format `http://[${NET_ADDR6}]:${WEB_PORT}/` if IPv6 global addresses are detected. Only the first address is displayed if multiple IPv6 addresses exist.

### Authentication Information

The administrator username (`AGH_USER`) and password (`AGH_PASS`) are displayed with emphasis in green and yellow when `NO_YAML` is not set.

When `NO_YAML=1`, authentication information is not displayed, and instead a "Configure via web interface" message and the default setup URL (`http://${NET_ADDR}:3000/`) are displayed.

### Reboot Notice

After installation completion, the message "Note: Web interface will be available after reboot" is displayed in yellow. This is because configuration changes are committed but the actual startup of the AdGuard Home service occurs on next system boot.

### QR Code Generation

QR codes corresponding to IPv4 and IPv6 access URLs are automatically generated in environments where the `qrencode` command is available. QR codes are displayed directly in the terminal in UTF-8 format, version 3, facilitating access from mobile devices.

## Usage Examples

The formal interface of this script is command line options. Control via environment variables is also technically possible, but this is an implementation detail primarily intended for integrated execution from other scripts and is not recommended for normal use.

### Interactive Installation

Executing without option specification prompts for installation mode selection and credential input interactively.
```bash
sh adguardhome.sh
```

### Installation from Official Binary
```bash
sh adguardhome.sh -i official
```

Input of username, password, and web port number is requested during execution.

### Installation from OpenWrt Package
```bash
sh adguardhome.sh -i openwrt
```

Automatically falls back to official binary if the package does not exist in the repository.

### Credential Update
```bash
sh adguardhome.sh -m
```

Interactively updates the username, password, and web port number of an existing installation.

### YAML Generation Skip
```bash
sh adguardhome.sh -i official -n
```

Omits automatic generation of configuration file and performs initial setup via the web interface (default port 3000).

### System Resource Check Disable
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

Multiple options can be specified simultaneously. The order of specification is arbitrary.

### TUI Integrated Mode
```bash
sh adguardhome.sh -t -i official
```

Mode for integrated execution from other scripts. Reboot prompts after processing completion are suppressed.

### Display Usage Information
```bash
sh adguardhome.sh -h
```

Displays option list and usage information.

## Standalone Mode and Integrated Mode

The script changes behavior depending on the execution form.

### Standalone Mode

Executed as standalone mode when `$(basename "$0")` matches `adguardhome.sh`. In this mode, reboot prompts are displayed after processing completion only when `INSTALL_MODE` and `REMOVE_MODE` are not set.

### Integrated Mode

Operates as integrated mode when loaded from other scripts via `source` or `.`. In this mode, all behavior can be controlled by environment variables, and reboot prompts are not displayed. The design assumes control from external sources.

## Error Handling and Recovery Processing

### System Resource Check

An error message is displayed and the process terminates if available memory is less than `MINIMUM_MEM` or free flash storage is less than `MINIMUM_FLASH`. This check can be disabled with `-c` option or `SKIP_RESOURCE_CHECK=1`.

### Package Manager Update

Detailed output is displayed and the process terminates with an error if package list update by opkg or apk fails. The main causes are network connection issues or repository failures.

### Dependency Package Installation

An error message is displayed and processing is interrupted if `htpasswd` installation fails. This process is skipped when `NO_YAML=1` is set.

### AdGuard Home Installation

Error messages are displayed and the process terminates for official binary download failure, service installation failure, and OpenWrt package installation failure respectively. Automatic fallback to official binary occurs when OpenWrt packages are unavailable.

### Service Restart

An error message is displayed and the process terminates if restart of dnsmasq, odhcpd, or firewall fails. The main causes are configuration inconsistencies or service abnormalities.

### LAN Interface Detection

An error message is displayed and the process terminates if LAN interface detection by `ubus` fails. This may occur when executed in environments other than OpenWrt.
