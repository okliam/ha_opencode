# Changelog

All notable changes to this project will be documented in this file.

## [1.4.7] - 2026-01-07

### Fixed

- **MCP Tool Response Compatibility Fix**: Fixed tool call errors with OpenCode
  - Root cause: OpenCode's MCP client doesn't support `structuredContent` (expects object, not array) and `resourceLinks`
  - Added `makeCompatibleResponse()` helper to strip unsupported fields from all tool responses
  - Tool responses now return only standard `content` field for maximum compatibility

## [1.4.6] - 2026-01-07

### Fixed

- **MCP Server Compatibility Fix**: Fixed "Failed to get tools" error with OpenCode
  - Root cause: OpenCode's MCP client doesn't support newer MCP spec fields (`outputSchema`, `annotations`, `title`)
  - Modified `tools/list` handler to return only standard fields: `name`, `description`, `inputSchema`
  - Tools now work correctly while maintaining full functionality

- **MCP Server Dependency Fix**: Fixed missing `zod` peer dependency causing MCP server module resolution failure
  - Root cause: `@modelcontextprotocol/sdk` requires `zod` as a non-optional peer dependency
  - Added `zod` as an explicit dependency in the MCP server's `package.json`
  - This ensures the MCP SDK can properly initialize and export its modules

- **MCP Server Environment Fix**: Fixed environment variable passing to MCP server
  - Added `environment` configuration to explicitly pass `SUPERVISOR_TOKEN` to the MCP server process
  - OpenCode spawns MCP servers as child processes with isolated environments
  - Uses OpenCode's `{env:VAR}` syntax for environment variable substitution

- **Node.js Engine Requirement**: Corrected `engines.node` from `>=20` to `>=18` to match Debian Bookworm's Node.js version

- **MCP Test Command**: Fixed `ha-mcp test` hanging - now sends proper MCP protocol messages with timeout

## [1.4.0] - 2026-01-07

### Added

- **Language Server Protocol (LSP) Integration**: Intelligent editing features for Home Assistant YAML files
  - **Entity ID Autocomplete**: Complete entity IDs from your live Home Assistant instance
  - **Service Autocomplete**: Complete service/action names with parameter documentation
  - **Area & Device Completion**: Complete area_id and device_id values
  - **Jinja2 Completion**: Complete Jinja2 functions (states, is_state, etc.) and entity references
  - **Trigger/Condition Completion**: Complete platform types and condition types
  - **Hover Information**: Hover over entity IDs to see current state, attributes, and metadata
  - **Template Preview**: Hover over Jinja2 templates to see rendered output
  - **Diagnostics**: Warnings for unknown entities, unknown services, missing !include files
  - **Go-to-Definition**: Jump to !include and !secret file references
  - **YAML Validation**: Basic YAML syntax validation

### Configuration

| Option | Default | Description |
|--------|---------|-------------|
| **lsp_enabled** | `true` | Enable/disable the Home Assistant LSP server |

### LSP Features

The LSP server provides intelligent assistance while editing YAML files:

**Completions**
- Type `entity_id:` and get suggestions from all your entities
- Type `service:` and get all available services with descriptions
- Type `area_id:` and get all defined areas
- Type `platform:` in a trigger to get trigger platforms
- Inside `{{ }}` get Jinja2 function suggestions

**Hover**
- Hover over `light.living_room` to see its current state and attributes
- Hover over `light.turn_on` to see service documentation and fields
- Hover over `{{ states('sensor.temperature') }}` to see the rendered result

**Diagnostics**
- Yellow warning if entity_id references a non-existent entity
- Yellow warning if service references a non-existent service
- Red error if !include references a missing file

**Go-to-Definition**
- Ctrl+click on `!include automations.yaml` to open that file
- Ctrl+click on `!secret api_key` to jump to secrets.yaml

### Technical Details

- LSP server runs as a separate Node.js process
- Communicates via stdio (standard input/output)
- Connects to Home Assistant via Supervisor API (same as MCP)
- Caches entity/service data with 60-second TTL for performance
- Works even without SUPERVISOR_TOKEN (limited features)

## [1.3.0] - 2026-01-07

### Added

- **MCP Server v2.1 - Cutting Edge Edition**: Implements latest MCP spec (2025-06-18) features
  - **Structured Tool Output**: All tools now return `structuredContent` with JSON schemas for typed responses
  - **Output Schemas**: Tools define `outputSchema` for validation and IDE support
  - **Tool Annotations**: Safety hints (`destructive`, `idempotent`, `readOnly`, `requiresConfirmation`)
  - **Resource Links**: Tools return links to related resources for follow-up exploration
  - **Logging Capability**: Server-side logging with configurable levels (debug to emergency)
  - **Content Annotations**: All content includes `audience` and `priority` hints

### Changed

- Updated `@modelcontextprotocol/sdk` to ^1.25.0 (was ^1.0.0)
- MCP server version bumped to 2.1.0
- All tools now include `title` field for human-readable display names
- All resources and prompts now include `title` field
- `call_service` tool now marked with `destructive: true` and `requiresConfirmation: true`
- `fire_event` tool now marked with `destructive: true`

### Tool Annotations Added

| Tool | Annotations |
|------|-------------|
| `call_service` | `destructive`, `requiresConfirmation` |
| `fire_event` | `destructive` |
| All read-only tools | `readOnly`, `idempotent` |

### Resource Links

Tools now return contextual links to related resources:
- `get_states` returns link to entity details
- `search_entities` returns links to top matching entities
- `get_entity_details` returns links to history and related entities
- `detect_anomalies` returns links to anomalous entities
- `diagnose_entity` returns link to entity history

### Content Annotations

All content now includes:
- `audience`: `["user"]`, `["assistant"]`, or `["user", "assistant"]`
- `priority`: 0.0 to 1.0 indicating importance

## [1.2.0] - 2026-01-07

### Added

- **MCP Server v2.0 - Enhanced Edition**: Complete overhaul of the Home Assistant MCP integration
  - **19 Tools** (was 10): Added history, logbook, calendars, semantic search, diagnostics, anomaly detection, suggestions
  - **9 Resources + 4 Templates**: Browsable data (automations, scripts, scenes, areas, config, anomalies, suggestions)
  - **6 Guided Prompts**: Pre-built workflows for troubleshooting, automation creation, energy audit, scene building, security review, morning routine
  - **Intelligence Layer**: Anomaly detection, semantic search, entity relationships, automation suggestions

### New MCP Tools

- `search_entities` - Semantic search for entities by natural language
- `get_entity_details` - Deep entity info with device/area relationships  
- `get_history` - Historical state data for trend analysis
- `get_logbook` - Activity timeline for debugging
- `get_calendars` - List calendar entities
- `get_calendar_events` - Query calendar events
- `detect_anomalies` - Find issues (low batteries, unusual readings, open doors)
- `get_suggestions` - Automation and optimization recommendations
- `diagnose_entity` - Comprehensive entity diagnostics

### New MCP Resources

- `ha://states/summary` - Human-readable state summary
- `ha://automations`, `ha://scripts`, `ha://scenes` - Configuration resources
- `ha://areas`, `ha://config`, `ha://integrations` - System info
- `ha://anomalies`, `ha://suggestions` - Intelligence resources
- Template resources: `ha://states/{domain}`, `ha://entity/{id}`, `ha://area/{id}`, `ha://history/{id}`

### New MCP Prompts

- `troubleshoot_entity` - Guided troubleshooting workflow
- `create_automation` - Step-by-step automation creation
- `energy_audit` - Energy usage analysis
- `scene_builder` - Interactive scene creation
- `security_review` - Security setup audit
- `morning_routine` - Routine automation design

### Intelligence Features

- **Anomaly Detection**: Low battery, unusual temps/humidity, doors open too long, lights on during day
- **Semantic Search**: Find entities by natural language queries
- **Entity Relationships**: Understand device-area-entity connections
- **Suggestion Engine**: Automatic automation recommendations

## [1.1.0] - 2026-01-07

### Changed

- **Breaking**: Switched from Alpine to Debian Bookworm base image
  - Fixes "cannot execute: required file not found" error
  - OpenCode ships pre-compiled glibc binaries incompatible with Alpine's musl
  - Image size increased but reliability improved
- OpenCode now auto-starts when opening the add-on
- Exiting OpenCode drops to bash shell for power users
- Simplified welcome banner

## [1.0.5] - 2026-01-07

### Changed

- Terminal theme: KDE Konsole Breeze colors for better readability
- Improved xterm.js settings:
  - `lineHeight=1.0` for tighter text
  - `fontWeight`/`fontWeightBold` for proper font weights
  - `drawBoldTextInBrightColors=true` to match Konsole behavior
  - `minimumContrastRatio=4.5` for WCAG AA accessibility
  - `scrollback=10000` for more history

## [1.0.0] - 2026-01-07

### Added

- Initial release
- OpenCode AI coding agent integration
- Modern web terminal with Catppuccin Mocha theme
- Ingress support for seamless Home Assistant integration
- Access to Home Assistant configuration directory
- Helper command `ha-logs` for viewing system logs:
  - Home Assistant Core logs
  - Home Assistant error log
  - Supervisor logs
  - Host system logs
- Home Assistant MCP server (experimental, disabled by default):
  - Query entity states
  - Call services
  - List areas and devices
  - Validate configuration
  - Render templates
  - Fire events
- Helper command `ha-mcp` to enable/disable MCP integration
- Support for 75+ AI providers via OpenCode
