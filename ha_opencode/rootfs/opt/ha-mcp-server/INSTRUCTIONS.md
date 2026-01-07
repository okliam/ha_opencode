# Home Assistant MCP Integration

You have access to the Home Assistant MCP server which provides deep integration with Home Assistant. Use these tools proactively to help users with their smart home.

## When to Use MCP Tools

### Always use MCP tools when the user asks about:
- Entity states ("What's the temperature?", "Are the lights on?")
- Controlling devices ("Turn on the lights", "Set thermostat to 72")
- Automations ("Create an automation that...")
- Troubleshooting ("Why isn't my sensor working?")
- Home status ("What's happening in my home?")

### Preferred Tool Selection

1. **For finding entities**: Use `search_entities` with natural language queries before `get_states`
2. **For entity details**: Use `get_entity_details` to understand relationships and device info
3. **For controlling devices**: Use `call_service` with appropriate domain/service
4. **For troubleshooting**: Use `diagnose_entity` for comprehensive analysis
5. **For overview**: Use `get_states` with `summarize: true` for human-readable summaries

## Intelligence Features

### Anomaly Detection
Proactively use `detect_anomalies` when:
- User asks about home status
- User reports something isn't working
- Before suggesting automations

### Automation Suggestions
Use `get_suggestions` when:
- User wants to automate something
- User asks for optimization ideas
- After reviewing their setup

### Semantic Search
The `search_entities` tool understands natural language:
- "bedroom lights" finds light.bedroom_*
- "motion sensors" finds binary_sensor.*motion*
- "front door" finds relevant door sensors

## Guided Workflows (Prompts)

Use these prompts for complex tasks:
- `troubleshoot_entity` - When debugging entity issues
- `create_automation` - When building new automations
- `energy_audit` - For energy optimization
- `scene_builder` - For creating scenes
- `security_review` - For security analysis
- `morning_routine` - For routine automations

## Best Practices

1. **Check before changing**: Use `get_states` before `call_service` to verify current state
2. **Validate configurations**: Use `validate_config` after editing YAML files
3. **Use history for debugging**: Use `get_history` when troubleshooting intermittent issues
4. **Leverage relationships**: Use `get_entity_details` to find related entities
5. **Be specific with services**: Always specify `entity_id` in the target for `call_service`

## Example Patterns

### Turn on a light
```
1. search_entities("living room light")
2. call_service(domain="light", service="turn_on", target={entity_id: "light.living_room"})
```

### Check home status
```
1. get_states(summarize=true)
2. detect_anomalies()
```

### Troubleshoot an entity
```
1. diagnose_entity(entity_id="sensor.problem_sensor")
2. get_history(entity_id="sensor.problem_sensor")
3. get_error_log(lines=50)
```

### Create an automation
```
1. search_entities() to find relevant entities
2. get_services() to understand available services
3. Write automation YAML
4. validate_config()
```
