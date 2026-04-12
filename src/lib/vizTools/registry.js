import additionTool from './additionTool.js'
import subtractionTool from './subtractionTool.js'
import multiplicationTool from './multiplicationTool.js'
import divisionTool from './divisionTool.js'

const tools = new Map()

function register(tool) {
  if (!tool?.name) throw new Error('Tool must have a name')
  if (!tool.execute) throw new Error(`Tool "${tool.name}" must have an execute method`)
  tools.set(tool.name, tool)
}

register(additionTool)
register(subtractionTool)
register(multiplicationTool)
register(divisionTool)

/**
 * Get a tool by name.
 * @param {string} name
 * @returns {object|null}
 */
export function getTool(name) {
  return tools.get(name) ?? null
}

/**
 * List all registered tools with their names, descriptions, and schemas.
 * Useful for introspection or building UI from available operations.
 * @returns {{ name: string, description: string, schema: object }[]}
 */
export function listTools() {
  return [...tools.values()].map(t => ({
    name: t.name,
    description: t.description,
    schema: t.schema,
  }))
}

/**
 * Validate params against a tool's schema.
 * @param {string} toolName
 * @param {object} params
 * @returns {{ valid: boolean, error?: string, [key: string]: any }}
 */
export function validateToolParams(toolName, params) {
  const tool = tools.get(toolName)
  if (!tool) return { valid: false, error: `Unknown tool "${toolName}"` }
  if (tool.validate) return tool.validate(params)
  return { valid: true, ...(params || {}) }
}

/**
 * Run a visualization tool.
 *
 * @param {string} toolName        — 'addition' | 'subtraction' | 'multiplication' | 'division'
 * @param {object} params          — tool-specific parameters (e.g. { a: 3, b: 4 })
 * @param {object} context         — runtime context provided by MathVisualization:
 *   @param {number}   context.now               — current time (performance.now() / 1000)
 *   @param {function} context.createAssetToken   — (color) => { mesh, materials, footprint }
 *   @param {number}   context.referenceFootprint — footprint of current asset template
 * @returns {{ maxStages: number, autoTimes: number[], objects: object[] } | null}
 */
export function runTool(toolName, params, context) {
  const tool = tools.get(toolName)
  if (!tool) {
    console.warn(`[vizTools] Unknown tool "${toolName}"`)
    return null
  }

  const validation = tool.validate ? tool.validate(params) : { valid: true, ...(params || {}) }
  if (!validation.valid) {
    console.warn(`[vizTools] Validation failed for "${toolName}":`, validation.error)
    return null
  }

  const { valid: _v, error: _e, ...cleanParams } = validation
  return tool.execute(cleanParams, context)
}

/**
 * Register a custom visualization tool at runtime.
 * Allows extending the system with new operations without touching existing code.
 *
 * @param {object} tool — { name, description, schema, validate, execute }
 */
export function registerTool(tool) {
  register(tool)
}
