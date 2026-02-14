# HA OpenCode: Technical Specification

## 1. Introduction

HA OpenCode is a Home Assistant addon that integrates an AI-powered coding agent with deep Home Assistant integration. It provides intelligent editing capabilities for Home Assistant configuration with Model Context Protocol (MCP) and Language Server Protocol (LSP) support.

## 2. Architecture Overview

### 2.1 Core Components
- **OpenCode AI Agent**: AI-powered coding assistant
- **MCP Server**: Home Assistant integration via Model Context Protocol
- **LSP Server**: Intelligent YAML editing with entity completion
- **Terminal Service**: Web-based terminal with persistent sessions
- **Web UI Service**: Standalone web interface

### 2.2 Service Architecture (s6-overlay)
- **init-opencode**: Environment initialization and CPU detection
- **ha-opencode**: Main terminal service with ttyd and tmux
- **opencode-web**: Web UI service on port 4096

## 3. Detailed Component Specifications

### 3.1 MCP Server (ha-mcp-server)

#### 3.1.1 Tools (31 total)
The MCP server provides 31 tools for Home Assistant integration:

**State Management:**
- `get_states`: Get entity states with filtering and summarization
- `search_entities`: Semantic search for entities
- `get_entity_details`: Detailed entity information with relationships

**Service Calls:**
- `call_service`: Execute Home Assistant services
- `get_services`: List available services

**History & Logs:**
- `get_history`: Entity state history
- `get_logbook`: Activity logbook entries

**Configuration:**
- `get_config`: Home Assistant configuration
- `get_areas`: List areas
- `get_devices`: List devices
- `validate_config`: Validate configuration files
- `get_error_log`: Error log access

**Events & Templates:**
- `fire_event`: Fire custom events
- `render_template`: Render Jinja2 templates

**Calendars:**
- `get_calendars`: List calendar entities
- `get_calendar_events`: Get calendar events

**Intelligence:**
- `detect_anomalies`: Scan for potential issues
- `get_suggestions`: Automation suggestions
- `diagnose_entity`: Entity diagnostics

**Documentation:**
- `get_integration_docs`: Integration documentation
- `get_breaking_changes`: Breaking changes information
- `check_config_syntax`: Syntax validation

**Update Management:**
- `get_available_updates`: Available updates
- `get_addon_changelog`: Addon changelog
- `update_component`: Update components
- `get_update_progress`: Monitor update progress

**ESPHome Integration:**
- `esphome_list_devices`: List ESPHome devices
- `esphome_compile`: Compile firmware
- `esphome_upload`: Upload firmware

**Firmware Monitoring:**
- `watch_firmware_update`: Monitor updates

#### 3.1.2 Resources (9 + 4 templates)
- `states/summary`: Human-readable state summary
- `automations`, `scripts`, `scenes`: Entity lists
- `areas`: Area definitions
- `config`: HA configuration
- `integrations`: Loaded components
- `anomalies`: Detected issues
- `suggestions`: Automation suggestions

**Templates:**
- `states/{domain}`: Domain-specific states
- `entity/{entity_id}`: Entity details
- `area/{area_id}`: Area details
- `history/{entity_id}`: Entity history

#### 3.1.3 Prompts (6)
- `troubleshoot_entity`: Guided troubleshooting
- `create_automation`: Automation builder
- `energy_audit`: Energy analysis
- `scene_builder`: Scene creation
- `security_review`: Security assessment
- `morning_routine`: Routine designer

### 3.2 LSP Server (ha-lsp-server)

#### 3.2.1 Features
- Entity ID autocomplete from live HA instance
- Service/action autocomplete with parameter hints
- Area, device, floor, label completion
- Unknown entity/service diagnostics
- Hover information for entities
- Jinja2 template preview on hover
- Go-to-definition for `!include` tags
- YAML validation for HA configurations

#### 3.2.2 Capabilities
- Completion provider with trigger characters
- Hover provider for entity/service info
- Diagnostic provider for validation
- Definition provider for include references

### 3.3 Terminal Service

#### 3.3.1 Session Management
- Uses tmux for persistent sessions
- Maintains session across OpenCode exits
- Proper stdin/stdout handling
- CPU compatibility detection

#### 3.3.2 Terminal Configuration
- ttyd web terminal with Catppuccin Mocha theme
- Configurable font sizes and cursor styles
- Multiple theme options (breeze, catppuccin, dracula, etc.)
- Ingress integration for sidebar access

### 3.4 Helper Scripts

#### 3.4.1 ha-logs
Helper script to view Home Assistant and system logs from the terminal.
- **Usage**: `ha-logs <type> [lines]`
- **Types**: `core`, `error`, `supervisor`, `host`
- **Implementation**: Queries Supervisor API via curl using `SUPERVISOR_TOKEN`

#### 3.4.2 ha-mcp
Helper script to manage the Home Assistant MCP server integration.
- **Usage**: `ha-mcp <command>`
- **Commands**: `enable`, `disable`, `status`, `test`
- **Implementation**: Modifies `opencode.json` configuration and tests connection to Supervisor API and MCP server

## 4. Configuration Files

### 4.1 config.yaml
```yaml
name: "HA OpenCode"
version: "1.2.3"
slug: "ha_opencode"
image: "ghcr.io/magnusoverli/ha_opencode/{arch}"

# Ingress configuration
ingress: true
ingress_port: 8099
ingress_stream: true
panel_icon: mdi:robot
panel_title: HA OpenCode

# Direct access port
ports:
  4096/tcp: 4096

# File access
map:
  - type: homeassistant_config
    read_only: false

# API access
hassio_api: true
hassio_role: default
homeassistant_api: true

# Security
host_network: false
privileged: []
apparmor: true

# User-configurable options
options:
  mcp_enabled: false
  lsp_enabled: true
  cpu_mode: "auto"
  terminal_theme: "breeze"
  font_size: 14
  cursor_style: "block"
  cursor_blink: false
  opencode_config: ""
  webui_enabled: true
  webui_password: ""
  webui_log_level: "INFO"
  webui_mdns: false
```

### 4.2 build.yaml
```yaml
build_from:
  aarch64: ghcr.io/home-assistant/aarch64-base-debian:bookworm
  amd64: ghcr.io/home-assistant/amd64-base-debian:bookworm
args:
  OPENCODE_VERSION: "latest"
  TTYD_VERSION: "1.7.7"
labels:
  org.opencontainers.image.title: "HA OpenCode"
  org.opencontainers.image.description: "AI coding agent for Home Assistant"
```

## 5. Docker Image Build Process

### 5.1 Base Image
- Debian Bookworm base for glibc compatibility
- Includes bashio, tempio for Home Assistant integration

### 5.2 Dependencies
- Node.js/npm for OpenCode and servers
- Git, jq, curl for utilities
- Procps for process management
- Tmux for session persistence
- ttyd for web terminal

### 5.3 Installation Process
1. Install system dependencies
2. Download ttyd from GitHub releases
3. Install OpenCode and Prettier globally
4. Install MCP and LSP server dependencies
5. Copy root filesystem (server code, scripts, etc.)
6. Set permissions and create runtime directories

## 6. Runtime Architecture

### 6.1 s6-overlay Services

#### 6.1.1 init-opencode Service
- Environment initialization
- CPU capability detection (AVX/AVX2 support)
- Binary selection (baseline/regular/musl variants)
- Configuration processing
- Default file deployment

#### 6.1.2 ha-opencode Service
- Starts ttyd with tmux session
- Configurable terminal themes
- Persistent session management
- Proper stdin/stdout handling

#### 6.1.3 opencode-web Service
- Standalone web UI
- Optional password authentication
- mDNS discovery support
- Health check integration

### 6.2 Session Management
- tmux sessions with `-A` flag (attach or create)
- Persistent sessions across OpenCode exits
- Bash fallback after OpenCode exit
- CPU compatibility detection

## 7. Security Considerations

### 7.1 Authentication
- Supervisor token for API access
- Optional Web UI password
- Bearer token authentication

### 7.2 Isolation
- Containerized execution
- Limited privileges
- AppArmor profile
- Network isolation

### 7.3 Permissions
- Minimal required permissions
- Read-only config directory option
- Supervisor API role restrictions

## 8. Integration Patterns

### 8.1 Home Assistant API Communication
- Supervisor API proxy for most endpoints
- Direct core API for error logs
- Direct supervisor API for management
- Proper authorization headers

### 8.2 MCP Protocol Implementation
- Standard MCP v2024-11-05 features
- Structured tool output
- Tool annotations (destructive, idempotent)
- Resource links and logging capability
- Content annotations (audience/priority)

### 8.3 LSP Protocol Implementation
- Standard Language Server Protocol
- Completion and hover providers
- Diagnostic and definition providers
- Incremental text synchronization

## 9. Deployment Configuration

### 9.1 Hardware Requirements
- AMD64 or ARM64 architecture
- Minimum 1GB RAM recommended
- CPU with AVX support (or baseline variant)

### 9.2 Network Configuration
- Ingress port 8099 for terminal access
- Direct access port 4096 for Web UI
- Supervisor API communication

### 9.3 Backup and Recovery
- Configuration stored in `/data` directory
- Persistent storage for user settings
- Backup exclude patterns for cache directories

## 10. Development Guidelines

### 10.1 Code Structure
- MCP server in `/opt/ha-mcp-server/`
- LSP server in `/opt/ha-lsp-server/`
- Scripts in `/usr/local/bin/`
- Services in `/etc/s6-overlay/s6-rc.d/`

### 10.2 Testing Strategy
- CPU compatibility testing
- Session persistence verification
- API integration testing
- UI functionality validation

### 10.3 Versioning
- Semantic versioning (major.minor.patch)
- Automated version shield updates
- Changelog maintenance
- Backward compatibility considerations