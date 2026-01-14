# 2026-01-14-mcp-remote-memory

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## VS Code MCP configuration

To use this server from VS Code, add an MCP server entry to your MCP settings (for example in a user/workspace `settings.json` depending on how you manage MCP servers).

Example configuration (JSONL backend):

```json
{
	"inputs": [
		{
			"type": "promptString",
			"id": "memory-file-path",
			"description": "Path to memory.jsonl (optional)",
			"password": false
		}
	],
	"servers": {
		"remote-memory": {
			"type": "stdio",
			"command": "bunx",
			"args": ["github:thiskevinwang/2026-01-14-mcp-remote-memory#7096e03"],
			"env": {
				"MEMORY_STORAGE_BACKEND": "jsonl",
				"MEMORY_FILE_PATH": "${input:memory-file-path}"
			}
		}
	}
}
```

Example configuration (Postgres backend):

```json
{
	"inputs": [
		{
			"type": "promptString",
			"id": "postgres-connection-string-v1",
			"description": "Postgres connection string",
			"password": true
		}
	],
	"servers": {
		"remote-memory": {
			"type": "stdio",
			"command": "bun",
			"args": ["github:thiskevinwang/2026-01-14-mcp-remote-memory#7096e03"],
			"env": {
				"MEMORY_STORAGE_BACKEND": "postgres",
				"POSTGRES_CONNECTION_STRING": "${input:postgres-connection-string-v1}"
			}
		}
	}
}
```

> [!TIP]
> Increment `postgres-connection-string-v1` to `v2` and restart the MCP server to force VSCode to re-prompt for the connection string.

## Storage backends

This MCP server supports multiple storage backends via a small plugin/registry.

Select a backend with:

- `MEMORY_STORAGE_BACKEND=jsonl` (default)
- `MEMORY_STORAGE_BACKEND=postgres`

### JSONL (default)

Stores the graph in a local `memory.jsonl` file.

Environment variables:

- `MEMORY_FILE_PATH` (optional): file path for the JSONL file. Relative paths are resolved from the server directory.

Backward compatibility:

- If a legacy `memory.json` exists and `memory.jsonl` does not, the server will automatically rename `memory.json` to `memory.jsonl` on startup.

### Postgres

Stores the graph in Postgres using Bun’s built-in Postgres client.

Environment variables:

- `POSTGRES_CONNECTION_STRING` (preferred) or `DATABASE_URL`: Postgres connection string

On startup, the server automatically runs migrations to create the required tables.

This project was created using `bun init` in bun v1.3.0. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Attribution

This project is built on top of https://github.com/modelcontextprotocol/servers/tree/main/src/memory