# Changelog
All notable changes to this project will be documented in this file.

## 1.0.15

**Build Improvements**

- Improved Dockerfile for best practices and performance
  - Use dynamic BUILD_VERSION label instead of hardcoded version
  - Add configurable OPENCODE_VERSION arg for reproducible builds
  - Fix parallel npm install with proper subshell syntax
  - Replace deprecated `--production` flag with modern `--omit=dev`
  - Remove npm audit suppression for better security visibility
  - Consolidate ENV and RUN layers for efficiency
  - Add .dockerignore to exclude unnecessary files from build context
- Fixed license in build.yaml (MIT → Unlicense)

## 1.0.14

**Terminology Update**

- Renamed "add-on" to "app" throughout the project to align with Home Assistant 2026.1 rebranding
  - Home Assistant now calls add-ons "apps" to better reflect that they are standalone applications running alongside Home Assistant
  - Updated all documentation, comments, and user-facing strings

## 1.0.13

**Bug Fixes**

- Fixed font rendering issues in web terminal (fixes #1)
  - Removed explicit fontFamily configuration from ttyd
  - Browser now uses default monospace font, avoiding letter-spacing issues when specified fonts aren't installed
  - Thanks to @pixeye33 for reporting!
- Fixed invalid JSON Schema for call_service MCP tool (fixes #2)
  - Updated target properties (entity_id, area_id, device_id) to use `oneOf` with proper `items` definition for array types
  - AI model APIs (OpenAI, Anthropic) now accept the schema without validation errors
  - Thanks to @Teeflo for the detailed bug report!

## 1.0.12

**Bug Fixes**

- Fixed MCP server API endpoint access
  - Added `callHACore()` function for direct Home Assistant Core API access
  - Fixed `get_error_log` to use correct endpoint (`/api/error_log` via Core API)
  - Some endpoints are not available via Supervisor proxy and require direct Core API access
- Improved device discovery in `get_devices` tool
  - More reliable device listing by iterating through all entity states
  - Ensures all devices are discovered, including those missed by filter-based approaches



## 1.0.11


**Bug Fixes**

- Fixed MCP server Jinja2 template bugs
  - Fixed `get_areas` template to use `namespace()` for proper list accumulation
  - Fixed `get_devices` to return device attributes (name, manufacturer, model, area)
  - Fixed `get_error_log` endpoint from `/error_log` to `/error/all`
  - Fixed `ha://areas` resource template with namespace() fix

## 1.0.10

**MCP Server Enhancements**

- Added documentation tools to MCP server v2.2 (Documentation Edition)
  - `get_integration_docs` - Fetch live documentation from Home Assistant website
  - `get_breaking_changes` - Check for breaking changes by version/integration
  - `check_config_syntax` - Validate YAML for deprecated patterns
  - Implemented HTML parsing and content extraction from HA documentation pages
  - Added deprecation pattern database for common configuration issues
  - LLMs now guided to always verify syntax against current docs before writing config
- Enhanced AGENTS.md with Home Assistant interaction guidelines
  - Added Home Assistant Interaction Model section
  - Added RESTRICTED section listing internal directories that should never be accessed
  - Provided guidance on when to use configuration files vs MCP tools


All notable changes to this project will be documented in this file.

## 1.0.9

**UI Improvements**

- Updated app icon and logo images

## 1.0.7

**New Feature**

- Added AGENTS.md customization feature
  - Default AGENTS.md file deployed to Home Assistant config directory on first install
  - Contains AI instructions and rules for OpenCode behavior
  - Users can customize AGENTS.md to add their own rules, preferences, and context
  - Edit `/config/AGENTS.md` using File Editor or any text editor
  - Includes user consent rules, Home Assistant knowledge, safety guidelines, and MCP awareness

## 1.0.6

**Documentation**

- Added LICENSE file (MIT License)
- Added repository README.md with installation instructions
- Cleaned up CHANGELOG to match repository history

## 1.0.5

**Improvements**

- Optimized Docker build process with better layer caching
  - Copy package.json files first to preserve npm install cache
  - Install MCP and LSP dependencies in parallel for faster builds
  - Code changes no longer invalidate dependency installation cache
- Simplified configuration script
  - Combined MCP and LSP configuration into single operation
  - Streamlined logging output
- Improved startup experience
  - Removed unnecessary delay before launching OpenCode

## 1.0.0

**Initial Release**

- OpenCode AI coding agent for Home Assistant
- Web terminal with ingress support
- Access to your configuration directory
- `ha-logs` command for viewing system logs
- MCP server for AI assistant integration (experimental)
- `ha-mcp` command to manage MCP integration
- Support for 75+ AI providers
- Home Assistant LSP (Language Server) for intelligent YAML editing
  - Entity ID autocomplete
  - Service autocomplete
  - Hover information for entities and services
  - Diagnostics for unknown entities/services
  - Go-to-definition for !include and !secret references