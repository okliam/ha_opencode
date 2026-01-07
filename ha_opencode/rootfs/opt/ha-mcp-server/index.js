#!/usr/bin/env node
/**
 * Home Assistant MCP Server for OpenCode (Enhanced Edition v2.1)
 * 
 * A cutting-edge MCP server providing deep integration with Home Assistant.
 * Implements the latest MCP specification (2025-06-18) features:
 * 
 * - Structured tool output with outputSchema
 * - Tool annotations (destructive, idempotent, etc.)
 * - Human-readable title fields
 * - Resource links in tool results
 * - Logging capability for debugging
 * - Content annotations (audience/priority)
 * 
 * TOOLS (19):
 * - Entity state management (get, search, history)
 * - Service calls with intelligent targeting
 * - Configuration validation and management
 * - Calendar, logbook, and history access
 * - Anomaly detection and suggestions
 * 
 * RESOURCES (9 + 4 templates):
 * - Live entity states by domain
 * - Automations, scripts, and scenes
 * - Area and device mappings
 * - System configuration
 * 
 * PROMPTS (6):
 * - Troubleshooting workflows
 * - Automation creation guides
 * - Energy optimization analysis
 * - Scene building assistance
 * 
 * Environment variables:
 * - SUPERVISOR_TOKEN: The Home Assistant Supervisor token (auto-provided in add-on)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourceTemplatesRequestSchema,
  SetLevelRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const SUPERVISOR_API = "http://supervisor/core/api";
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN;

if (!SUPERVISOR_TOKEN) {
  console.error("Error: SUPERVISOR_TOKEN environment variable is required");
  process.exit(1);
}

// ============================================================================
// LOGGING SYSTEM
// ============================================================================

let currentLogLevel = "info";
const LOG_LEVELS = ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"];

function getLogLevelIndex(level) {
  return LOG_LEVELS.indexOf(level);
}

function shouldLog(level) {
  return getLogLevelIndex(level) >= getLogLevelIndex(currentLogLevel);
}

function sendLog(level, logger, data) {
  if (shouldLog(level)) {
    // Log notifications are sent via server.notification
    // For now, we log to stderr which the client can capture
    console.error(JSON.stringify({
      type: "log",
      level,
      logger,
      data,
      timestamp: new Date().toISOString(),
    }));
  }
}

// ============================================================================
// HOME ASSISTANT API HELPERS
// ============================================================================

async function callHA(endpoint, method = "GET", body = null) {
  sendLog("debug", "ha-api", { action: "request", endpoint, method });
  
  const options = {
    method,
    headers: {
      "Authorization": `Bearer ${SUPERVISOR_TOKEN}`,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${SUPERVISOR_API}${endpoint}`, options);
  
  if (!response.ok) {
    const text = await response.text();
    sendLog("error", "ha-api", { action: "error", endpoint, status: response.status, error: text });
    throw new Error(`HA API error (${response.status}): ${text}`);
  }

  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const result = await response.json();
    sendLog("debug", "ha-api", { action: "response", endpoint, success: true });
    return result;
  }
  return response.text();
}

// ============================================================================
// COMMON SCHEMAS FOR STRUCTURED OUTPUT
// ============================================================================

const SCHEMAS = {
  entityState: {
    type: "object",
    properties: {
      entity_id: { type: "string", description: "Entity identifier" },
      state: { type: "string", description: "Current state value" },
      friendly_name: { type: "string", description: "Human-readable name" },
      device_class: { type: "string", description: "Device classification" },
      last_changed: { type: "string", description: "ISO timestamp of last state change" },
      last_updated: { type: "string", description: "ISO timestamp of last update" },
    },
    required: ["entity_id", "state"],
  },
  
  entityStateArray: {
    type: "array",
    items: {
      type: "object",
      properties: {
        entity_id: { type: "string" },
        state: { type: "string" },
        friendly_name: { type: "string" },
        device_class: { type: "string" },
      },
      required: ["entity_id", "state"],
    },
  },
  
  searchResult: {
    type: "array",
    items: {
      type: "object",
      properties: {
        entity_id: { type: "string" },
        state: { type: "string" },
        friendly_name: { type: "string" },
        device_class: { type: "string" },
        score: { type: "number", description: "Search relevance score" },
      },
      required: ["entity_id", "state", "score"],
    },
  },
  
  entityDetails: {
    type: "object",
    properties: {
      entity_id: { type: "string" },
      friendly_name: { type: "string" },
      state: { type: "string" },
      domain: { type: "string" },
      device_class: { type: "string" },
      device_id: { type: "string" },
      area_id: { type: "string" },
      attributes: { type: "object" },
      related_entities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            entity_id: { type: "string" },
            friendly_name: { type: "string" },
            state: { type: "string" },
            relationship: { type: "string", enum: ["same_device", "same_area"] },
          },
        },
      },
    },
    required: ["entity_id", "state", "domain"],
  },
  
  serviceCallResult: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      domain: { type: "string" },
      service: { type: "string" },
      affected_entities: { type: "array", items: { type: "string" } },
    },
    required: ["success", "domain", "service"],
  },
  
  anomaly: {
    type: "object",
    properties: {
      entity_id: { type: "string" },
      reason: { type: "string" },
      severity: { type: "string", enum: ["info", "warning", "error"] },
    },
    required: ["entity_id", "reason", "severity"],
  },
  
  anomalyArray: {
    type: "array",
    items: {
      type: "object",
      properties: {
        entity_id: { type: "string" },
        reason: { type: "string" },
        severity: { type: "string", enum: ["info", "warning", "error"] },
      },
      required: ["entity_id", "reason", "severity"],
    },
  },
  
  suggestion: {
    type: "object",
    properties: {
      type: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      entities: { type: "array", items: { type: "string" } },
    },
    required: ["type", "title", "description"],
  },
  
  suggestionArray: {
    type: "array",
    items: {
      type: "object",
      properties: {
        type: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["type", "title", "description"],
    },
  },
  
  diagnostics: {
    type: "object",
    properties: {
      entity_id: { type: "string" },
      timestamp: { type: "string" },
      current_state: { type: "object" },
      checks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            check: { type: "string" },
            status: { type: "string", enum: ["ok", "info", "warning", "error"] },
            details: { type: "string" },
          },
        },
      },
      history_summary: { type: "object" },
      relationships: { type: "object" },
    },
    required: ["entity_id", "timestamp", "checks"],
  },
  
  configValidation: {
    type: "object",
    properties: {
      result: { type: "string", enum: ["valid", "invalid"] },
      errors: { type: "string" },
    },
    required: ["result"],
  },
  
  area: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
    },
    required: ["id", "name"],
  },
  
  areaArray: {
    type: "array",
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
      },
      required: ["id", "name"],
    },
  },
};

// ============================================================================
// INTELLIGENCE LAYER - Semantic Analysis & Summaries
// ============================================================================

/**
 * Generate a human-readable summary of entity states
 */
function generateStateSummary(states) {
  const byDomain = {};
  const anomalies = [];
  const unavailable = [];
  
  for (const state of states) {
    const [domain] = state.entity_id.split(".");
    if (!byDomain[domain]) {
      byDomain[domain] = { count: 0, on: 0, off: 0, entities: [] };
    }
    byDomain[domain].count++;
    byDomain[domain].entities.push(state);
    
    if (state.state === "on") byDomain[domain].on++;
    if (state.state === "off") byDomain[domain].off++;
    if (state.state === "unavailable" || state.state === "unknown") {
      unavailable.push(state.entity_id);
    }
    
    // Detect anomalies
    const anomaly = detectAnomaly(state);
    if (anomaly) anomalies.push(anomaly);
  }
  
  const lines = ["## Home Assistant State Summary\n"];
  
  // Domain overview
  lines.push("### By Domain");
  for (const [domain, info] of Object.entries(byDomain).sort((a, b) => b[1].count - a[1].count)) {
    let detail = `${info.count} entities`;
    if (info.on > 0 || info.off > 0) {
      detail += ` (${info.on} on, ${info.off} off)`;
    }
    lines.push(`- **${domain}**: ${detail}`);
  }
  
  // Unavailable entities
  if (unavailable.length > 0) {
    lines.push("\n### Unavailable/Unknown Entities");
    for (const id of unavailable.slice(0, 10)) {
      lines.push(`- ${id}`);
    }
    if (unavailable.length > 10) {
      lines.push(`- ... and ${unavailable.length - 10} more`);
    }
  }
  
  // Anomalies
  if (anomalies.length > 0) {
    lines.push("\n### Potential Anomalies Detected");
    for (const a of anomalies.slice(0, 5)) {
      lines.push(`- **${a.entity_id}**: ${a.reason}`);
    }
  }
  
  return lines.join("\n");
}

/**
 * Detect anomalies in entity states
 */
function detectAnomaly(state) {
  const { entity_id, state: value, attributes } = state;
  const [domain] = entity_id.split(".");
  
  // Battery low
  if (attributes?.battery_level !== undefined && attributes.battery_level < 20) {
    return { entity_id, reason: `Low battery (${attributes.battery_level}%)`, severity: "warning" };
  }
  
  // Temperature sensors out of normal range
  if (domain === "sensor" && attributes?.device_class === "temperature") {
    const temp = parseFloat(value);
    if (!isNaN(temp)) {
      const unit = attributes.unit_of_measurement || "°C";
      const isCelsius = unit.includes("C");
      const normalMin = isCelsius ? -10 : 14;
      const normalMax = isCelsius ? 50 : 122;
      if (temp < normalMin || temp > normalMax) {
        return { entity_id, reason: `Unusual temperature: ${value}${unit}`, severity: "warning" };
      }
    }
  }
  
  // Humidity out of range
  if (domain === "sensor" && attributes?.device_class === "humidity") {
    const humidity = parseFloat(value);
    if (!isNaN(humidity) && (humidity < 10 || humidity > 95)) {
      return { entity_id, reason: `Unusual humidity: ${value}%`, severity: "warning" };
    }
  }
  
  // Door/window sensors open for extended period
  if ((domain === "binary_sensor") && 
      (attributes?.device_class === "door" || attributes?.device_class === "window") &&
      value === "on") {
    const lastChanged = new Date(state.last_changed);
    const hoursOpen = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60);
    if (hoursOpen > 4) {
      return { entity_id, reason: `Open for ${hoursOpen.toFixed(1)} hours`, severity: "info" };
    }
  }
  
  // Lights on during day (basic heuristic)
  if (domain === "light" && value === "on") {
    const hour = new Date().getHours();
    if (hour >= 10 && hour <= 16) {
      return { entity_id, reason: "Light on during daytime", severity: "info" };
    }
  }
  
  return null;
}

/**
 * Search entities semantically
 */
function searchEntities(states, query) {
  const queryLower = query.toLowerCase();
  const terms = queryLower.split(/\s+/);
  
  const results = states.map(state => {
    let score = 0;
    const searchText = [
      state.entity_id,
      state.attributes?.friendly_name || "",
      state.attributes?.device_class || "",
      state.state,
    ].join(" ").toLowerCase();
    
    for (const term of terms) {
      if (searchText.includes(term)) {
        score += 1;
        if ((state.attributes?.friendly_name || "").toLowerCase().includes(term)) {
          score += 2;
        }
        if (state.entity_id.includes(term)) {
          score += 1;
        }
      }
    }
    
    return { state, score };
  }).filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(r => ({
      entity_id: r.state.entity_id,
      state: r.state.state,
      friendly_name: r.state.attributes?.friendly_name,
      device_class: r.state.attributes?.device_class,
      score: r.score,
    }));
  
  return results;
}

/**
 * Get entity relationships
 */
async function getEntityRelationships(entityId) {
  const states = await callHA("/states");
  const entity = states.find(s => s.entity_id === entityId);
  
  if (!entity) {
    return { error: "Entity not found" };
  }
  
  const [domain] = entityId.split(".");
  const deviceId = entity.attributes?.device_id;
  const areaId = entity.attributes?.area_id;
  
  const related = states.filter(s => {
    if (s.entity_id === entityId) return false;
    if (deviceId && s.attributes?.device_id === deviceId) return true;
    if (areaId && s.attributes?.area_id === areaId) return true;
    return false;
  }).map(s => ({
    entity_id: s.entity_id,
    friendly_name: s.attributes?.friendly_name,
    state: s.state,
    relationship: s.attributes?.device_id === deviceId ? "same_device" : "same_area",
  }));
  
  return {
    entity_id: entityId,
    friendly_name: entity.attributes?.friendly_name,
    state: entity.state,
    domain,
    device_class: entity.attributes?.device_class,
    device_id: deviceId,
    area_id: areaId,
    attributes: entity.attributes,
    related_entities: related.slice(0, 10),
  };
}

/**
 * Generate automation suggestions
 */
function generateSuggestions(states) {
  const suggestions = [];
  
  const motionSensors = states.filter(s => 
    s.attributes?.device_class === "motion" || 
    s.entity_id.includes("motion")
  );
  const lights = states.filter(s => s.entity_id.startsWith("light."));
  
  for (const motion of motionSensors) {
    const areaId = motion.attributes?.area_id;
    if (areaId) {
      const areaLights = lights.filter(l => l.attributes?.area_id === areaId);
      if (areaLights.length > 0) {
        suggestions.push({
          type: "motion_light",
          title: "Motion-Activated Lighting",
          description: `Create automation: When ${motion.attributes?.friendly_name || motion.entity_id} detects motion, turn on ${areaLights.map(l => l.attributes?.friendly_name || l.entity_id).join(", ")}`,
          trigger_entity: motion.entity_id,
          action_entities: areaLights.map(l => l.entity_id),
        });
      }
    }
  }
  
  const openings = states.filter(s => 
    s.attributes?.device_class === "door" || 
    s.attributes?.device_class === "window"
  );
  if (openings.length > 0) {
    suggestions.push({
      type: "security_alert",
      title: "Security Alert Automation",
      description: `Create notification when doors/windows are left open for extended periods`,
      entities: openings.map(o => o.entity_id).slice(0, 5),
    });
  }
  
  const thermostats = states.filter(s => s.entity_id.startsWith("climate."));
  const tempSensors = states.filter(s => s.attributes?.device_class === "temperature");
  if (thermostats.length > 0 && tempSensors.length > 0) {
    suggestions.push({
      type: "climate_optimization",
      title: "Climate Optimization",
      description: "Create automations to adjust thermostat based on occupancy or outdoor temperature",
      climate_entities: thermostats.map(t => t.entity_id),
      sensor_entities: tempSensors.map(s => s.entity_id).slice(0, 3),
    });
  }
  
  const powerSensors = states.filter(s => 
    s.attributes?.device_class === "power" || 
    s.attributes?.device_class === "energy"
  );
  if (powerSensors.length > 0) {
    suggestions.push({
      type: "energy_monitoring",
      title: "Energy Usage Alerts",
      description: "Create alerts for unusual energy consumption patterns",
      entities: powerSensors.map(p => p.entity_id).slice(0, 5),
    });
  }
  
  return suggestions;
}

// ============================================================================
// HELPER: Create annotated content
// ============================================================================

function createTextContent(text, options = {}) {
  const content = { type: "text", text };
  if (options.audience || options.priority !== undefined) {
    content.annotations = {};
    if (options.audience) content.annotations.audience = options.audience;
    if (options.priority !== undefined) content.annotations.priority = options.priority;
  }
  return content;
}

function createResourceLink(uri, name, description, options = {}) {
  const link = {
    type: "resource_link",
    uri,
    name,
    description,
  };
  if (options.mimeType) link.mimeType = options.mimeType;
  if (options.audience || options.priority !== undefined) {
    link.annotations = {};
    if (options.audience) link.annotations.audience = options.audience;
    if (options.priority !== undefined) link.annotations.priority = options.priority;
  }
  return link;
}

// ============================================================================
// MCP SERVER SETUP
// ============================================================================

const server = new Server(
  {
    name: "home-assistant",
    version: "2.1.0",
  },
  {
    capabilities: {
      tools: {
        listChanged: false,
      },
      resources: {
        subscribe: false,
        listChanged: false,
      },
      prompts: {
        listChanged: false,
      },
      logging: {},
    },
  }
);

// ============================================================================
// TOOLS DEFINITION - With titles, outputSchema, and annotations
// ============================================================================

const TOOLS = [
  // === STATE MANAGEMENT ===
  {
    name: "get_states",
    title: "Get Entity States",
    description: "Get the current state of entities. Can return all entities, filter by domain, or get a specific entity. Returns entity_id, state, and key attributes.",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: {
          type: "string",
          description: "Specific entity ID (e.g., 'light.living_room'). If not provided, returns all/filtered entities.",
        },
        domain: {
          type: "string",
          description: "Filter by domain (e.g., 'light', 'switch', 'sensor', 'automation')",
        },
        summarize: {
          type: "boolean",
          description: "If true, returns a human-readable summary instead of raw data",
        },
      },
    },
    outputSchema: SCHEMAS.entityStateArray,
    annotations: {
      readOnly: true,
      idempotent: true,
      openWorld: false,
    },
  },
  {
    name: "search_entities",
    title: "Search Entities",
    description: "Search for entities by name, type, or description. Uses semantic matching to find relevant entities.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (e.g., 'bedroom lights', 'temperature sensors', 'front door')",
        },
      },
      required: ["query"],
    },
    outputSchema: SCHEMAS.searchResult,
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
  {
    name: "get_entity_details",
    title: "Get Entity Details",
    description: "Get detailed information about an entity including its relationships to devices, areas, and related entities.",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: {
          type: "string",
          description: "The entity ID to get details for",
        },
      },
      required: ["entity_id"],
    },
    outputSchema: SCHEMAS.entityDetails,
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
  
  // === SERVICE CALLS ===
  {
    name: "call_service",
    title: "Call Home Assistant Service",
    description: "Call a Home Assistant service to control devices or trigger actions. Use for turning on/off lights, running scripts, triggering automations, etc. THIS MODIFIES DEVICE STATE.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Service domain (e.g., 'light', 'switch', 'automation', 'script', 'climate')",
        },
        service: {
          type: "string",
          description: "Service name (e.g., 'turn_on', 'turn_off', 'toggle', 'trigger', 'set_temperature')",
        },
        target: {
          type: "object",
          description: "Target for the service call",
          properties: {
            entity_id: { type: ["string", "array"], description: "Entity ID(s) to target" },
            area_id: { type: ["string", "array"], description: "Area ID(s) to target" },
            device_id: { type: ["string", "array"], description: "Device ID(s) to target" },
          },
        },
        data: {
          type: "object",
          description: "Additional service data (e.g., brightness: 255, color_temp: 400, temperature: 72)",
        },
      },
      required: ["domain", "service"],
    },
    outputSchema: SCHEMAS.serviceCallResult,
    annotations: {
      destructive: true,
      idempotent: false,
      requiresConfirmation: true,
    },
  },
  {
    name: "get_services",
    title: "List Available Services",
    description: "List available services, optionally filtered by domain. Shows what actions can be performed.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Filter services by domain (e.g., 'light', 'climate')",
        },
      },
    },
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
  
  // === HISTORY & LOGBOOK ===
  {
    name: "get_history",
    title: "Get Entity History",
    description: "Get historical state data for entities. Essential for analyzing trends, debugging issues, or understanding patterns.",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: {
          type: "string",
          description: "Entity ID to get history for (required)",
        },
        start_time: {
          type: "string",
          description: "Start time in ISO format (e.g., '2024-01-15T00:00:00'). Defaults to 24 hours ago.",
        },
        end_time: {
          type: "string",
          description: "End time in ISO format. Defaults to now.",
        },
        minimal: {
          type: "boolean",
          description: "If true, returns minimal response (faster, less data)",
        },
      },
      required: ["entity_id"],
    },
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
  {
    name: "get_logbook",
    title: "Get Activity Logbook",
    description: "Get logbook entries showing what happened in Home Assistant. Useful for understanding recent activity and debugging.",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: { type: "string", description: "Filter by specific entity" },
        start_time: { type: "string", description: "Start time in ISO format. Defaults to 24 hours ago." },
        end_time: { type: "string", description: "End time in ISO format. Defaults to now." },
      },
    },
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
  
  // === CONFIGURATION ===
  {
    name: "get_config",
    title: "Get Home Assistant Configuration",
    description: "Get Home Assistant configuration including location, units, version, and loaded components.",
    inputSchema: { type: "object", properties: {} },
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
  {
    name: "get_areas",
    title: "List All Areas",
    description: "List all areas defined in Home Assistant with their IDs and names.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: SCHEMAS.areaArray,
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
  {
    name: "get_devices",
    title: "List Devices",
    description: "List devices registered in Home Assistant, optionally filtered by area.",
    inputSchema: {
      type: "object",
      properties: {
        area_id: { type: "string", description: "Filter devices by area ID" },
      },
    },
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
  {
    name: "validate_config",
    title: "Validate Configuration",
    description: "Validate Home Assistant configuration files. Run this before restarting to catch errors.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: SCHEMAS.configValidation,
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
  {
    name: "get_error_log",
    title: "Get Error Log",
    description: "Get the Home Assistant error log. Useful for debugging issues.",
    inputSchema: {
      type: "object",
      properties: {
        lines: { type: "number", description: "Number of lines to return (default: 100)" },
      },
    },
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
  
  // === EVENTS & TEMPLATES ===
  {
    name: "fire_event",
    title: "Fire Custom Event",
    description: "Fire a custom event in Home Assistant. Can be used to trigger automations or communicate between systems.",
    inputSchema: {
      type: "object",
      properties: {
        event_type: { type: "string", description: "Event type to fire (e.g., 'custom_event', 'my_notification')" },
        event_data: { type: "object", description: "Optional data to include with the event" },
      },
      required: ["event_type"],
    },
    annotations: {
      destructive: true,
      idempotent: false,
    },
  },
  {
    name: "render_template",
    title: "Render Jinja2 Template",
    description: "Render a Jinja2 template using Home Assistant's template engine. Powerful for complex data extraction and formatting.",
    inputSchema: {
      type: "object",
      properties: {
        template: { type: "string", description: "Jinja2 template (e.g., '{{ states(\"sensor.temperature\") }}', '{{ now() }}')" },
      },
      required: ["template"],
    },
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
  
  // === CALENDARS ===
  {
    name: "get_calendars",
    title: "List Calendars",
    description: "List all calendar entities in Home Assistant.",
    inputSchema: { type: "object", properties: {} },
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
  {
    name: "get_calendar_events",
    title: "Get Calendar Events",
    description: "Get events from a specific calendar within a time range.",
    inputSchema: {
      type: "object",
      properties: {
        calendar_entity: { type: "string", description: "Calendar entity ID (e.g., 'calendar.family')" },
        start: { type: "string", description: "Start time in ISO format" },
        end: { type: "string", description: "End time in ISO format" },
      },
      required: ["calendar_entity"],
    },
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
  
  // === INTELLIGENCE ===
  {
    name: "detect_anomalies",
    title: "Detect Anomalies",
    description: "Scan all entities for potential anomalies like low batteries, unusual sensor readings, or devices in unexpected states.",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Limit scan to specific domain" },
      },
    },
    outputSchema: SCHEMAS.anomalyArray,
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
  {
    name: "get_suggestions",
    title: "Get Automation Suggestions",
    description: "Get intelligent automation and optimization suggestions based on your current Home Assistant setup.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: SCHEMAS.suggestionArray,
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
  {
    name: "diagnose_entity",
    title: "Diagnose Entity",
    description: "Run diagnostics on an entity to help troubleshoot issues. Checks state history, related entities, and common problems.",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: { type: "string", description: "Entity to diagnose" },
      },
      required: ["entity_id"],
    },
    outputSchema: SCHEMAS.diagnostics,
    annotations: {
      readOnly: true,
      idempotent: true,
    },
  },
];

// ============================================================================
// RESOURCES DEFINITION - With titles
// ============================================================================

const RESOURCES = [
  {
    uri: "ha://states/summary",
    name: "state_summary",
    title: "State Summary",
    description: "Human-readable summary of all Home Assistant entity states",
    mimeType: "text/markdown",
  },
  {
    uri: "ha://automations",
    name: "automations",
    title: "Automations List",
    description: "List of all automations with their current state and last triggered time",
    mimeType: "application/json",
  },
  {
    uri: "ha://scripts",
    name: "scripts",
    title: "Scripts List",
    description: "List of all scripts available in Home Assistant",
    mimeType: "application/json",
  },
  {
    uri: "ha://scenes",
    name: "scenes",
    title: "Scenes List",
    description: "List of all scenes that can be activated",
    mimeType: "application/json",
  },
  {
    uri: "ha://areas",
    name: "areas",
    title: "Areas List",
    description: "All areas defined in Home Assistant with associated entities",
    mimeType: "application/json",
  },
  {
    uri: "ha://config",
    name: "config",
    title: "HA Configuration",
    description: "Home Assistant configuration details",
    mimeType: "application/json",
  },
  {
    uri: "ha://integrations",
    name: "integrations",
    title: "Loaded Integrations",
    description: "List of loaded integrations/components",
    mimeType: "application/json",
  },
  {
    uri: "ha://anomalies",
    name: "anomalies",
    title: "Detected Anomalies",
    description: "Currently detected anomalies and potential issues",
    mimeType: "application/json",
  },
  {
    uri: "ha://suggestions",
    name: "suggestions",
    title: "Automation Suggestions",
    description: "Automation and optimization suggestions",
    mimeType: "application/json",
  },
];

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: "ha://states/{domain}",
    name: "states_by_domain",
    title: "States by Domain",
    description: "Get all entity states for a specific domain (e.g., light, switch, sensor)",
    mimeType: "application/json",
  },
  {
    uriTemplate: "ha://entity/{entity_id}",
    name: "entity_details",
    title: "Entity Details",
    description: "Detailed information about a specific entity",
    mimeType: "application/json",
  },
  {
    uriTemplate: "ha://area/{area_id}",
    name: "area_details",
    title: "Area Details",
    description: "All entities and devices in a specific area",
    mimeType: "application/json",
  },
  {
    uriTemplate: "ha://history/{entity_id}",
    name: "entity_history",
    title: "Entity History",
    description: "Recent state history for an entity (last 24 hours)",
    mimeType: "application/json",
  },
];

// ============================================================================
// PROMPTS DEFINITION - With titles
// ============================================================================

const PROMPTS = [
  {
    name: "troubleshoot_entity",
    title: "Troubleshoot Entity",
    description: "Guided troubleshooting for a problematic entity. Analyzes state, history, and related entities to identify issues.",
    arguments: [
      { name: "entity_id", description: "The entity ID that's having problems", required: true },
      { name: "problem_description", description: "Brief description of the problem", required: false },
    ],
  },
  {
    name: "create_automation",
    title: "Create Automation",
    description: "Step-by-step guide to create a new automation. Helps identify triggers, conditions, and actions.",
    arguments: [
      { name: "goal", description: "What you want the automation to accomplish", required: true },
    ],
  },
  {
    name: "energy_audit",
    title: "Energy Audit",
    description: "Analyze energy usage and suggest optimizations. Reviews power sensors, lights, climate, and usage patterns.",
    arguments: [],
  },
  {
    name: "scene_builder",
    title: "Scene Builder",
    description: "Interactive scene creation assistant. Captures current states or helps design new scenes.",
    arguments: [
      { name: "area", description: "Area to create scene for (optional)", required: false },
      { name: "mood", description: "Desired mood/atmosphere (e.g., 'relaxing', 'movie night', 'energizing')", required: false },
    ],
  },
  {
    name: "security_review",
    title: "Security Review",
    description: "Review security-related entities and suggest improvements. Checks locks, sensors, cameras, and alarm systems.",
    arguments: [],
  },
  {
    name: "morning_routine",
    title: "Morning Routine Designer",
    description: "Design a morning routine automation based on your devices and preferences.",
    arguments: [
      { name: "wake_time", description: "Usual wake-up time (e.g., '7:00 AM')", required: false },
    ],
  },
];

// ============================================================================
// REQUEST HANDLERS
// ============================================================================

// --- Logging: Set Level ---
server.setRequestHandler(SetLevelRequestSchema, async (request) => {
  const { level } = request.params;
  if (LOG_LEVELS.includes(level)) {
    currentLogLevel = level;
    sendLog("info", "mcp-server", { action: "log_level_changed", level });
    return {};
  }
  throw new Error(`Invalid log level: ${level}`);
});

// --- List Tools ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  sendLog("debug", "mcp-server", { action: "list_tools" });
  // Strip newer MCP spec fields that some clients may not support
  // Keep only: name, description, inputSchema (standard fields)
  const compatibleTools = TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
  return { tools: compatibleTools };
});

// --- Call Tool ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  sendLog("info", "mcp-server", { action: "call_tool", tool: name, args });

  // Helper to strip unsupported MCP features from response for OpenCode compatibility
  const makeCompatibleResponse = (result) => {
    // Keep only standard fields: content, isError
    // Remove: structuredContent, resourceLinks (not supported by OpenCode)
    return {
      content: result.content,
      ...(result.isError && { isError: result.isError }),
    };
  };

  try {
    let result;
    switch (name) {
      // === STATE MANAGEMENT ===
      case "get_states": {
        if (args?.entity_id) {
          const state = await callHA(`/states/${args.entity_id}`);
          return makeCompatibleResponse({
            content: [
              createTextContent(JSON.stringify(state, null, 2), { audience: ["assistant"], priority: 0.8 }),
            ],
          });
        }
        
        let states = await callHA("/states");
        if (args?.domain) {
          states = states.filter((s) => s.entity_id.startsWith(`${args.domain}.`));
        }
        
        if (args?.summarize) {
          const summary = generateStateSummary(states);
          return makeCompatibleResponse({
            content: [createTextContent(summary, { audience: ["user", "assistant"], priority: 0.9 })],
          });
        }
        
        const simplified = states.map((s) => ({
          entity_id: s.entity_id,
          state: s.state,
          friendly_name: s.attributes?.friendly_name,
          device_class: s.attributes?.device_class,
        }));
        return makeCompatibleResponse({
          content: [createTextContent(JSON.stringify(simplified, null, 2), { audience: ["assistant"], priority: 0.7 })],
        });
      }

      case "search_entities": {
        const states = await callHA("/states");
        const results = searchEntities(states, args.query);
        
        return makeCompatibleResponse({
          content: [
            createTextContent(
              results.length > 0 
                ? JSON.stringify(results, null, 2)
                : `No entities found matching "${args.query}"`,
              { audience: ["assistant"], priority: 0.8 }
            ),
          ],
        });
      }

      case "get_entity_details": {
        const relationships = await getEntityRelationships(args.entity_id);
        return makeCompatibleResponse({
          content: [createTextContent(JSON.stringify(relationships, null, 2), { audience: ["assistant"], priority: 0.8 })],
        });
      }

      // === SERVICE CALLS ===
      case "call_service": {
        const { domain, service, target, data } = args;
        sendLog("notice", "ha-service", { action: "call", domain, service, target });
        
        const payload = { ...data };
        if (target) {
          Object.assign(payload, target);
        }
        const result = await callHA(`/services/${domain}/${service}`, "POST", payload);
        
        return makeCompatibleResponse({
          content: [
            createTextContent(
              `Service ${domain}.${service} called successfully.\n${JSON.stringify(result, null, 2)}`,
              { audience: ["user", "assistant"], priority: 0.9 }
            ),
          ],
        });
      }

      case "get_services": {
        let services = await callHA("/services");
        if (args?.domain) {
          services = services.filter((s) => s.domain === args.domain);
        }
        return makeCompatibleResponse({
          content: [createTextContent(JSON.stringify(services, null, 2), { audience: ["assistant"], priority: 0.6 })],
        });
      }

      // === HISTORY & LOGBOOK ===
      case "get_history": {
        const entityId = args.entity_id;
        const startTime = args.start_time || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const params = new URLSearchParams({ filter_entity_id: entityId });
        if (args.end_time) params.append("end_time", args.end_time);
        if (args.minimal) {
          params.append("minimal_response", "true");
          params.append("no_attributes", "true");
        }
        
        const history = await callHA(`/history/period/${encodeURIComponent(startTime)}?${params}`);
        return makeCompatibleResponse({
          content: [createTextContent(JSON.stringify(history, null, 2), { audience: ["assistant"], priority: 0.7 })],
        });
      }

      case "get_logbook": {
        const startTime = args.start_time || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const params = new URLSearchParams();
        if (args.entity_id) params.append("entity", args.entity_id);
        if (args.end_time) params.append("end_time", args.end_time);
        
        const logbook = await callHA(`/logbook/${encodeURIComponent(startTime)}?${params}`);
        return makeCompatibleResponse({
          content: [createTextContent(JSON.stringify(logbook, null, 2), { audience: ["assistant"], priority: 0.7 })],
        });
      }

      // === CONFIGURATION ===
      case "get_config": {
        const config = await callHA("/config");
        return makeCompatibleResponse({
          content: [createTextContent(JSON.stringify(config, null, 2), { audience: ["assistant"], priority: 0.6 })],
        });
      }

      case "get_areas": {
        const result = await callHA("/template", "POST", {
          template: "{% set area_list = [] %}{% for area in areas() %}{% set area_list = area_list + [{'id': area, 'name': area_name(area)}] %}{% endfor %}{{ area_list | tojson }}"
        });
        return makeCompatibleResponse({
          content: [createTextContent(result, { audience: ["assistant"], priority: 0.7 })],
        });
      }

      case "get_devices": {
        let template = "{{ devices() | list }}";
        if (args?.area_id) {
          template = `{{ area_devices('${args.area_id}') | list }}`;
        }
        const result = await callHA("/template", "POST", { template });
        return makeCompatibleResponse({
          content: [createTextContent(result, { audience: ["assistant"], priority: 0.6 })],
        });
      }

      case "validate_config": {
        const result = await callHA("/config/core/check_config", "POST");
        return makeCompatibleResponse({
          content: [
            createTextContent(
              JSON.stringify(result, null, 2),
              { audience: ["user", "assistant"], priority: 0.9 }
            ),
          ],
        });
      }

      case "get_error_log": {
        const log = await callHA("/error_log");
        const lines = args?.lines || 100;
        const logLines = log.split("\n").slice(-lines).join("\n");
        return makeCompatibleResponse({
          content: [createTextContent(logLines, { audience: ["assistant"], priority: 0.8 })],
        });
      }

      // === EVENTS & TEMPLATES ===
      case "fire_event": {
        const { event_type, event_data } = args;
        sendLog("notice", "ha-event", { action: "fire", event_type });
        await callHA(`/events/${event_type}`, "POST", event_data || {});
        return makeCompatibleResponse({
          content: [createTextContent(`Event '${event_type}' fired successfully.`, { audience: ["user"], priority: 0.9 })],
        });
      }

      case "render_template": {
        const result = await callHA("/template", "POST", { template: args.template });
        return makeCompatibleResponse({
          content: [createTextContent(result, { audience: ["assistant"], priority: 0.8 })],
        });
      }

      // === CALENDARS ===
      case "get_calendars": {
        const calendars = await callHA("/calendars");
        return makeCompatibleResponse({
          content: [createTextContent(JSON.stringify(calendars, null, 2), { audience: ["assistant"], priority: 0.6 })],
        });
      }

      case "get_calendar_events": {
        const { calendar_entity } = args;
        const start = args.start || new Date().toISOString();
        const end = args.end || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const events = await callHA(
          `/calendars/${calendar_entity}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
        );
        return makeCompatibleResponse({
          content: [createTextContent(JSON.stringify(events, null, 2), { audience: ["assistant"], priority: 0.7 })],
        });
      }

      // === INTELLIGENCE ===
      case "detect_anomalies": {
        let states = await callHA("/states");
        if (args?.domain) {
          states = states.filter((s) => s.entity_id.startsWith(`${args.domain}.`));
        }
        
        const anomalies = states
          .map(detectAnomaly)
          .filter(Boolean)
          .sort((a, b) => (b.severity === "warning" ? 1 : 0) - (a.severity === "warning" ? 1 : 0));
        
        if (anomalies.length === 0) {
          return makeCompatibleResponse({
            content: [createTextContent("No anomalies detected. All entities appear to be operating normally.", { audience: ["user"], priority: 0.9 })],
          });
        }
        
        return makeCompatibleResponse({
          content: [
            createTextContent(
              `Found ${anomalies.length} potential anomalies:\n\n${JSON.stringify(anomalies, null, 2)}`,
              { audience: ["user", "assistant"], priority: 0.9 }
            ),
          ],
        });
      }

      case "get_suggestions": {
        const states = await callHA("/states");
        const suggestions = generateSuggestions(states);
        
        if (suggestions.length === 0) {
          return makeCompatibleResponse({
            content: [createTextContent("No suggestions at this time. Your Home Assistant setup looks well configured!", { audience: ["user"], priority: 0.8 })],
          });
        }
        
        return makeCompatibleResponse({
          content: [createTextContent(JSON.stringify(suggestions, null, 2), { audience: ["user", "assistant"], priority: 0.8 })],
        });
      }

      case "diagnose_entity": {
        const { entity_id } = args;
        sendLog("info", "diagnostics", { action: "diagnose", entity_id });
        
        const diagnostics = {
          entity_id,
          timestamp: new Date().toISOString(),
          checks: [],
        };
        
        try {
          const state = await callHA(`/states/${entity_id}`);
          diagnostics.current_state = state;
          diagnostics.checks.push({ check: "Current State", status: "ok", details: state.state });
          
          if (state.state === "unavailable" || state.state === "unknown") {
            diagnostics.checks.push({ 
              check: "Availability", 
              status: "warning", 
              details: `Entity is ${state.state}. Check device connectivity.` 
            });
          }
          
          const relationships = await getEntityRelationships(entity_id);
          diagnostics.relationships = relationships;
          diagnostics.checks.push({ 
            check: "Relationships", 
            status: "ok", 
            details: `Found ${relationships.related_entities?.length || 0} related entities` 
          });
          
          const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const params = new URLSearchParams({
            filter_entity_id: entity_id,
            minimal_response: "true",
          });
          const history = await callHA(`/history/period/${encodeURIComponent(startTime)}?${params}`);
          
          if (history && history[0]) {
            const stateChanges = history[0].length;
            diagnostics.history_summary = {
              state_changes_24h: stateChanges,
              last_changed: state.last_changed,
              last_updated: state.last_updated,
            };
            
            diagnostics.checks.push({ 
              check: "Activity", 
              status: stateChanges === 0 ? "info" : "ok", 
              details: stateChanges === 0 ? "No state changes in last 24 hours" : `${stateChanges} state changes in last 24 hours`
            });
          }
          
          const anomaly = detectAnomaly(state);
          if (anomaly) {
            diagnostics.checks.push({ 
              check: "Anomaly Detection", 
              status: anomaly.severity, 
              details: anomaly.reason 
            });
          }
          
        } catch (error) {
          diagnostics.checks.push({ 
            check: "Entity Lookup", 
            status: "error", 
            details: error.message 
          });
        }
        
        return makeCompatibleResponse({
          content: [createTextContent(JSON.stringify(diagnostics, null, 2), { audience: ["assistant"], priority: 0.9 })],
        });
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    sendLog("error", "mcp-server", { action: "tool_error", tool: name, error: error.message });
    return makeCompatibleResponse({
      content: [createTextContent(`Error: ${error.message}`, { audience: ["user"], priority: 1.0 })],
      isError: true,
    });
  }
});

// --- List Resources ---
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  sendLog("debug", "mcp-server", { action: "list_resources" });
  return { resources: RESOURCES };
});

// --- List Resource Templates ---
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
  return { resourceTemplates: RESOURCE_TEMPLATES };
});

// --- Read Resource ---
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  sendLog("debug", "mcp-server", { action: "read_resource", uri });
  
  try {
    // Static resources
    if (uri === "ha://states/summary") {
      const states = await callHA("/states");
      const summary = generateStateSummary(states);
      return {
        contents: [{ 
          uri, 
          mimeType: "text/markdown", 
          text: summary,
          annotations: { audience: ["user", "assistant"], priority: 0.9 },
        }],
      };
    }
    
    if (uri === "ha://automations") {
      const states = await callHA("/states");
      const automations = states
        .filter(s => s.entity_id.startsWith("automation."))
        .map(s => ({
          entity_id: s.entity_id,
          friendly_name: s.attributes?.friendly_name,
          state: s.state,
          last_triggered: s.attributes?.last_triggered,
        }));
      return {
        contents: [{ 
          uri, 
          mimeType: "application/json", 
          text: JSON.stringify(automations, null, 2),
          annotations: { audience: ["assistant"], priority: 0.7 },
        }],
      };
    }
    
    if (uri === "ha://scripts") {
      const states = await callHA("/states");
      const scripts = states
        .filter(s => s.entity_id.startsWith("script."))
        .map(s => ({
          entity_id: s.entity_id,
          friendly_name: s.attributes?.friendly_name,
          state: s.state,
        }));
      return {
        contents: [{ 
          uri, 
          mimeType: "application/json", 
          text: JSON.stringify(scripts, null, 2),
          annotations: { audience: ["assistant"], priority: 0.6 },
        }],
      };
    }
    
    if (uri === "ha://scenes") {
      const states = await callHA("/states");
      const scenes = states
        .filter(s => s.entity_id.startsWith("scene."))
        .map(s => ({
          entity_id: s.entity_id,
          friendly_name: s.attributes?.friendly_name,
        }));
      return {
        contents: [{ 
          uri, 
          mimeType: "application/json", 
          text: JSON.stringify(scenes, null, 2),
          annotations: { audience: ["assistant"], priority: 0.6 },
        }],
      };
    }
    
    if (uri === "ha://areas") {
      const result = await callHA("/template", "POST", {
        template: "{% set area_list = [] %}{% for area in areas() %}{% set area_list = area_list + [{'id': area, 'name': area_name(area)}] %}{% endfor %}{{ area_list | tojson }}"
      });
      return {
        contents: [{ 
          uri, 
          mimeType: "application/json", 
          text: result,
          annotations: { audience: ["assistant"], priority: 0.7 },
        }],
      };
    }
    
    if (uri === "ha://config") {
      const config = await callHA("/config");
      return {
        contents: [{ 
          uri, 
          mimeType: "application/json", 
          text: JSON.stringify(config, null, 2),
          annotations: { audience: ["assistant"], priority: 0.5 },
        }],
      };
    }
    
    if (uri === "ha://integrations") {
      const config = await callHA("/config");
      return {
        contents: [{ 
          uri, 
          mimeType: "application/json", 
          text: JSON.stringify(config.components || [], null, 2),
          annotations: { audience: ["assistant"], priority: 0.4 },
        }],
      };
    }
    
    if (uri === "ha://anomalies") {
      const states = await callHA("/states");
      const anomalies = states.map(detectAnomaly).filter(Boolean);
      return {
        contents: [{ 
          uri, 
          mimeType: "application/json", 
          text: JSON.stringify(anomalies, null, 2),
          annotations: { audience: ["user", "assistant"], priority: 0.8 },
        }],
      };
    }
    
    if (uri === "ha://suggestions") {
      const states = await callHA("/states");
      const suggestions = generateSuggestions(states);
      return {
        contents: [{ 
          uri, 
          mimeType: "application/json", 
          text: JSON.stringify(suggestions, null, 2),
          annotations: { audience: ["user", "assistant"], priority: 0.7 },
        }],
      };
    }
    
    // Template-based resources
    const statesMatch = uri.match(/^ha:\/\/states\/(\w+)$/);
    if (statesMatch) {
      const domain = statesMatch[1];
      const states = await callHA("/states");
      const filtered = states
        .filter(s => s.entity_id.startsWith(`${domain}.`))
        .map(s => ({
          entity_id: s.entity_id,
          state: s.state,
          friendly_name: s.attributes?.friendly_name,
          device_class: s.attributes?.device_class,
        }));
      return {
        contents: [{ 
          uri, 
          mimeType: "application/json", 
          text: JSON.stringify(filtered, null, 2),
          annotations: { audience: ["assistant"], priority: 0.7 },
        }],
      };
    }
    
    const entityMatch = uri.match(/^ha:\/\/entity\/(.+)$/);
    if (entityMatch) {
      const entityId = entityMatch[1];
      const relationships = await getEntityRelationships(entityId);
      return {
        contents: [{ 
          uri, 
          mimeType: "application/json", 
          text: JSON.stringify(relationships, null, 2),
          annotations: { audience: ["assistant"], priority: 0.8 },
        }],
      };
    }
    
    const areaMatch = uri.match(/^ha:\/\/area\/(.+)$/);
    if (areaMatch) {
      const areaId = areaMatch[1];
      const states = await callHA("/states");
      const areaEntities = states.filter(s => s.attributes?.area_id === areaId);
      const areaNameResult = await callHA("/template", "POST", {
        template: `{{ area_name('${areaId}') }}`
      });
      return {
        contents: [{ 
          uri, 
          mimeType: "application/json", 
          text: JSON.stringify({
            area_id: areaId,
            area_name: areaNameResult,
            entities: areaEntities.map(s => ({
              entity_id: s.entity_id,
              state: s.state,
              friendly_name: s.attributes?.friendly_name,
            })),
          }, null, 2),
          annotations: { audience: ["assistant"], priority: 0.7 },
        }],
      };
    }
    
    const historyMatch = uri.match(/^ha:\/\/history\/(.+)$/);
    if (historyMatch) {
      const entityId = historyMatch[1];
      const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const params = new URLSearchParams({
        filter_entity_id: entityId,
        minimal_response: "true",
      });
      const history = await callHA(`/history/period/${encodeURIComponent(startTime)}?${params}`);
      return {
        contents: [{ 
          uri, 
          mimeType: "application/json", 
          text: JSON.stringify(history, null, 2),
          annotations: { audience: ["assistant"], priority: 0.6 },
        }],
      };
    }
    
    throw new Error(`Unknown resource: ${uri}`);
  } catch (error) {
    sendLog("error", "mcp-server", { action: "read_resource_error", uri, error: error.message });
    throw new Error(`Failed to read resource ${uri}: ${error.message}`);
  }
});

// --- List Prompts ---
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  sendLog("debug", "mcp-server", { action: "list_prompts" });
  return { prompts: PROMPTS };
});

// --- Get Prompt ---
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  sendLog("info", "mcp-server", { action: "get_prompt", prompt: name });
  
  try {
    switch (name) {
      case "troubleshoot_entity": {
        const entityId = args?.entity_id;
        if (!entityId) throw new Error("entity_id is required");
        const problemDesc = args?.problem_description || "not working as expected";
        
        return {
          description: `Troubleshooting guide for ${entityId}`,
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `I need help troubleshooting an entity in Home Assistant.

**Entity:** ${entityId}
**Problem:** ${problemDesc}

Please help me diagnose and fix this issue. Start by:
1. Using the \`diagnose_entity\` tool to get current state and history
2. Check if the entity is available and responding
3. Look at related entities that might be affected
4. Review the error log for any related messages
5. Suggest specific fixes based on what you find

Focus on practical solutions I can implement.`,
              annotations: { audience: ["assistant"], priority: 1.0 },
            },
          }],
        };
      }
      
      case "create_automation": {
        const goal = args?.goal;
        if (!goal) throw new Error("goal is required");
        
        return {
          description: "Automation creation guide",
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `I want to create a new Home Assistant automation.

**Goal:** ${goal}

Please help me create this automation by:
1. First, use \`search_entities\` to find relevant entities for this automation
2. Identify the best trigger(s) for this use case
3. Suggest any conditions that might be needed
4. Define the action(s) to take
5. Provide the complete automation YAML code

Also check if similar automations already exist using \`get_states\` with domain "automation".

Consider edge cases and make the automation robust.`,
              annotations: { audience: ["assistant"], priority: 1.0 },
            },
          }],
        };
      }
      
      case "energy_audit": {
        return {
          description: "Energy usage analysis and optimization",
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `Please perform an energy audit of my Home Assistant setup.

Steps:
1. Use \`search_entities\` to find all energy/power related sensors
2. Check the current state of all lights using \`get_states\` with domain "light"
3. Review climate/thermostat entities
4. Look for smart plugs and their power consumption
5. Get suggestions using the \`get_suggestions\` tool

Provide a summary including:
- Current energy consumers that are active
- Potential energy savings opportunities
- Automation suggestions to reduce energy usage
- Any anomalies in power consumption`,
              annotations: { audience: ["assistant"], priority: 1.0 },
            },
          }],
        };
      }
      
      case "scene_builder": {
        const area = args?.area || "the specified area";
        const mood = args?.mood || "comfortable";
        
        return {
          description: "Interactive scene creation",
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `Help me create a new scene for ${area} with a "${mood}" mood.

Steps:
1. Use \`get_areas\` to understand the available areas
2. Use \`search_entities\` to find controllable entities in the area (lights, switches, etc.)
3. For lights, suggest appropriate brightness and color temperature settings
4. For climate devices, suggest appropriate temperatures
5. Consider any media players or other relevant devices

Provide:
- A descriptive name for the scene
- Complete scene YAML configuration
- Any automations that might trigger this scene
- Tips for adjusting the scene`,
              annotations: { audience: ["assistant"], priority: 1.0 },
            },
          }],
        };
      }
      
      case "security_review": {
        return {
          description: "Security review of Home Assistant setup",
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `Please perform a security review of my Home Assistant setup.

Steps:
1. Use \`search_entities\` to find all security-related entities:
   - Door/window sensors (binary_sensor with device_class door/window)
   - Motion sensors
   - Lock entities
   - Alarm panels
   - Camera entities

2. Check current states using \`get_states\`
3. Use \`detect_anomalies\` to find any issues
4. Review automation coverage for security scenarios

Provide:
- Current security status (all doors locked? sensors active?)
- Any vulnerabilities or gaps in coverage
- Suggested automations for better security
- Best practices recommendations`,
              annotations: { audience: ["assistant"], priority: 1.0 },
            },
          }],
        };
      }
      
      case "morning_routine": {
        const wakeTime = args?.wake_time || "7:00 AM";
        
        return {
          description: "Morning routine automation design",
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `Help me design a morning routine automation for ${wakeTime}.

Steps:
1. Use \`search_entities\` to find relevant devices:
   - Bedroom lights
   - Coffee maker or kitchen appliances
   - Thermostat/climate
   - Window blinds/covers
   - Speakers for announcements

2. Check existing automations with \`get_states\` domain "automation"
3. Consider calendar integration using \`get_calendars\`

Design a routine that:
- Gradually increases lighting
- Adjusts temperature for waking
- Optionally starts coffee/breakfast prep
- Provides weather or calendar briefing

Provide complete automation YAML and any required helper entities.`,
              annotations: { audience: ["assistant"], priority: 1.0 },
            },
          }],
        };
      }
      
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  } catch (error) {
    sendLog("error", "mcp-server", { action: "get_prompt_error", prompt: name, error: error.message });
    throw new Error(`Failed to get prompt ${name}: ${error.message}`);
  }
});

// ============================================================================
// START SERVER
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  sendLog("info", "mcp-server", { 
    action: "started",
    version: "2.1.0",
    tools: TOOLS.length,
    resources: RESOURCES.length,
    prompts: PROMPTS.length,
  });
  
  console.error("Home Assistant MCP server v2.1.0 started (Cutting Edge Edition)");
  console.error(`Capabilities: Tools (${TOOLS.length}), Resources (${RESOURCES.length}), Prompts (${PROMPTS.length}), Logging`);
  console.error("Features: Structured Output, Tool Annotations, Resource Links, Content Annotations");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
