import { McpAgent } from "agents/mcp"; // Assuming McpAgent is available as in the example
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Define our NCI GDC MCP agent
export class NciGdcMCP extends McpAgent {
	server = new McpServer({
		name: "NciGdcExplorer",
		version: "0.1.0",
		description:
			`MCP Server for querying the National Cancer Institute (NCI) Genomic Data Commons (GDC) GraphQL API.
This server uses the GDC Search and Retrieval Endpoint: https://api.gdc.cancer.gov/v0/graphql.
It does NOT use the GDC Submission Endpoint.

Before running any specific data queries, it is **strongly recommended** to use GraphQL introspection queries to explore and understand the schema of the GDC API. Introspection allows you to:

- **Discover all available types, fields, and relationships** in the API, ensuring you know exactly what data you can access and how to structure your queries.
- **Avoid common errors** due to typos or incorrect field names, as you can verify the schema directly before querying.
- **Stay resilient to schema changes**: The GDC API may evolve, and introspection lets you dynamically adapt to new or deprecated fields.
- **Craft more efficient and precise queries** by understanding which fields are available and how they are nested, reducing unnecessary trial and error.
- **Accelerate development and debugging**: Introspection provides a live, up-to-date contract for the API, making it easier to troubleshoot and optimize your queries.

**Example introspection queries:**
To list all types:
\`\`\`graphql
{
  __schema {
    types {
      name
      kind
      fields {
        name
      }
    }
  }
}
\`\`\`
To get details about a specific type like "Case":
\`\`\`graphql
{
  __type(name: "Case") {
    name
    kind
    description
    fields {
      name
    }
  }
}
\`\`\`
Use introspection to map out the schema, then construct targeted queries for cases, files, projects, annotations, and more.

Refer to the NCI GDC Data Portal documentation (https://gdc.cancer.gov/developers/gdc-application-programming-interface-api/gdc-api-user-guide/graphql-quick-start) and the GraphiQL tool (available at the API endpoint) for further schema exploration and query examples. If a query fails, always consider using introspection to verify field names and types before retrying.`,
		capabilities: {
			tools: {}, // Indicates tool support
		}
	});

	// NCI GDC API Configuration
	private readonly GDC_GRAPHQL_ENDPOINT = "https://api.gdc.cancer.gov/v0/graphql";

	async init() {
		console.error("NCI GDC MCP Server initialized.");

		// Register the GraphQL execution tool
		this.server.tool(
			"gdc_graphql_query",
			`Executes a GraphQL query against the NCI GDC GraphQL API (Search and Retrieval Endpoint: ${this.GDC_GRAPHQL_ENDPOINT}).

**IMPORTANT: FiltersArgument must be a string-encoded JSON object, not a JS object.**

- **Correct:**
  filters: "{\"op\":\"=\",\"content\":{\"field\":\"primary_site\",\"value\":[\"Brain\"]}}"
- **Incorrect:**
  filters: {op: "=", content: {field: "primary_site", value: ["Brain"]}}

**Best Practices for GDC GraphQL Queries:**
1. **Filters must be string-encoded JSON** (see above). This applies to all filters, including nested/complex filters.
2. **Apply filters, sorting, and other arguments to the operation (e.g., hits), not the entity.**
   - Incorrect: ssms(filters: ...)
   - Correct: ssms { hits(filters: ...) { ... } }
3. **Enum values (e.g., sort order) are case-sensitive and must be lowercase.**
   - Correct: order: desc
4. **Complex filters use nested JSON with 'and'/'or' operators.**
   - Example: filters: "{\"op\":\"and\",\"content\":[{...},{...}]}"
5. **Use dot notation for nested field paths in filters.**
   - Example: consequence.transcript.gene.symbol
6. **Available filter operators include:** =, !=, >, >=, <, <=, in, and, or
7. **Use GraphQL introspection to discover available types and fields before building queries.**
   - Example: { __type(name: "Case") { fields { name } } }
8. **Working query template:**
\`\`\`graphql
{
  explore {
    ssms {
      hits(
        first: 10,
        filters: "{\\\"op\\\":\\\"and\\\",\\\"content\\\":[{\\\"op\\\":\\\"=\\\",\\\"content\\\":{\\\"field\\\":\\\"consequence.transcript.annotation.vep_impact\\\",\\\"value\\\":[\\\"HIGH\\\"]}}]}"
      ) {
        edges {
          node {
            genomic_dna_change
            gene_aa_change
            consequence {
              hits(first: 1) {
                edges {
                  node {
                    transcript {
                      consequence_type
                      gene { symbol }
                      annotation { vep_impact }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
\`\`\`

**If you encounter errors:**
- Double-check that filters are string-encoded JSON.
- Use introspection to verify field names and types.
- Ensure arguments are placed on the correct operation (hits, aggregations, etc.).
- Check enum value case (e.g., desc not DESC).

For more, see the GDC API docs: https://gdc.cancer.gov/developers/gdc-application-programming-interface-api/gdc-api-user-guide/graphql-quick-start
`,
			{
				query: z.string().describe(
					`The GraphQL query string to execute against the NCI GDC GraphQL API.

**Filters must be string-encoded JSON.**
- Example: filters: "{\\\"op\\\":\\\"=\\\",\\\"content\\\":{\\\"field\\\":\\\"primary_site\\\",\\\"value\\\":[\\\"Brain\\\"]}}"
- Use introspection queries like '{ __type(name: "Case") { fields { name } } }' to discover fields before building complex queries.`
				),
				variables: z
					.record(z.any())
					.optional()
					.describe(
						`Optional dictionary of variables for the GraphQL query.
For filter variables, provide the filter as a properly formatted JSON string:
{ "filters": "{\\\"op\\\":\\\"=\\\",\\\"content\\\":{\\\"field\\\":\\\"cases.case_id\\\",\\\"value\\\":[\\\"dcd5860c-7e3a-44f3-a732-fe92fe3fe300\\\"]}}" }
`
					),
			},
			async ({ query, variables }: { query: string; variables?: Record<string, any> }) => {
				console.error(`Executing gdc_graphql_query with query: ${query.slice(0, 150)}...`);
				if (variables) {
					console.error(`With variables: ${JSON.stringify(variables).slice(0, 100)}...`);
				}

				const result = await this.executeNciGdcGraphQLQuery(query, variables);

				return {
					content: [
						{
							type: "text",
							// Pretty print JSON for easier reading by humans, and parsable by LLMs.
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}
		);
	}

	// Helper function to execute NCI GDC GraphQL queries
	private async executeNciGdcGraphQLQuery(
		query: string,
		variables?: Record<string, any>
	): Promise<any> {
		try {
			const headers = {
				"Content-Type": "application/json",
				"Accept": "application/json", // Ensure we ask for JSON
				"User-Agent": "NciGdcMCP/0.1.0 (ModelContextProtocol; +https://modelcontextprotocol.io)",
			};

			const bodyData: Record<string, any> = { query };
			if (variables && Object.keys(variables).length > 0) {
				bodyData.variables = variables;
			}

			console.error(`Making GraphQL request to: ${this.GDC_GRAPHQL_ENDPOINT}`);
			// console.error(`Request body: ${JSON.stringify(bodyData)}`); // Can be very verbose

			const response = await fetch(this.GDC_GRAPHQL_ENDPOINT, {
				method: "POST",
				headers,
				body: JSON.stringify(bodyData),
			});

			console.error(`NCI GDC API response status: ${response.status}`);

			if (!response.ok) {
				let errorText = `NCI GDC API HTTP Error ${response.status}`;
				try {
					const errorBody = await response.text();
					errorText += `: ${errorBody.slice(0, 500)}`;
				} catch (e) {
					// ignore if can't read body
				}
				console.error(errorText);
				return {
					errors: [
						{
							message: `NCI GDC API HTTP Error ${response.status}`,
							extensions: {
								statusCode: response.status,
								responseText: errorText,
							},
						},
					],
				};
			}

			// Try to parse JSON.
			let responseBody: any;
			try {
				responseBody = await response.json();
			} catch (e) {
				const errorText = await response.text(); // Get text if JSON parsing fails
				console.error(
					`NCI GDC API response is not JSON. Status: ${response.status}, Body: ${errorText.slice(0, 500)}`
				);
				return {
					errors: [
						{
							message: `NCI GDC API Error: Non-JSON response.`,
							extensions: {
								statusCode: response.status,
								responseText: errorText.slice(0, 1000),
							},
						},
					],
				};
			}

			// The responseBody contains the GraphQL result, which might include `data` and/or `errors` fields.
			// Log if there are GraphQL-specific errors in the response body
			if (responseBody.errors) {
				console.error(`NCI GDC API GraphQL errors: ${JSON.stringify(responseBody.errors).slice(0, 500)}`);
			}
			return responseBody;

		} catch (error) {
			// This catch block handles network errors or other issues with the fetch call itself
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(
				`Client-side error during NCI GDC GraphQL request: ${errorMessage}`
			);
			return {
				errors: [
					{
						message: `Client-side error: ${errorMessage}`,
					},
				],
			};
		}
	}
}

// Define the Env interface for environment variables, if any.
// For this server, no specific environment variables are strictly needed for NCI GDC API access.
interface Env {
	MCP_HOST?: string;
	MCP_PORT?: string;
}

// Dummy ExecutionContext for type compatibility, usually provided by the runtime environment (e.g., Cloudflare Workers).
interface ExecutionContext {
	waitUntil(promise: Promise<any>): void;
	passThroughOnException(): void;
}

// Export the fetch handler, standard for environments like Cloudflare Workers or Deno Deploy.
export default {
	async fetch(request: Request, env: Record<string, DurableObjectNamespace<McpAgent<unknown, unknown, Record<string, unknown>>>>, ctx: { waitUntil(promise: Promise<any>): void; passThroughOnException(): void; props: any }): Promise<Response> {
		const url = new URL(request.url);

		// Streamable HTTP transport is primary
		if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
			// The `NciGdcMCP.serve` static method provides Streamable HTTP transport
			// @ts-ignore McpAgent provides serve method
			const httpHandler = NciGdcMCP.serve("/mcp");
			return httpHandler.fetch(request, env, ctx);
		}

		// SSE transport (legacy support)
		if (url.pathname === "/sse" || url.pathname.startsWith("/sse/")) {
			// The `NciGdcMCP.serveSSE` static method (inherited from McpAgent or its base)
			// is expected to return an object with a `fetch` method.
			// @ts-ignore McpAgent or a base class should provide serveSSE
			const sseHandler = NciGdcMCP.serveSSE("/sse");
			return sseHandler.fetch(request, env, ctx);
		}

		// Fallback for unhandled paths
		console.error(
			`NCI GDC MCP Server. Requested path ${url.pathname} not found. Available transports: /mcp (HTTP), /sse (SSE).`
		);

		return new Response(
			`NCI GDC MCP Server - Path not found.\nAvailable MCP paths:\n- /mcp (for Streamable HTTP transport)\n- /sse (for Server-Sent Events transport)`,
			{
				status: 404,
				headers: { "Content-Type": "text/plain" },
			}
		);
	},};
// Export the Agent class if it needs to be used by other modules or for testing.
// This alias matches the one in the example for consistency.
export { NciGdcMCP as MyMCP };