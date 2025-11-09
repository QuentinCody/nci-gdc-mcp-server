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
			tools: {
				listChanged: true
			}
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

**CRITICAL: Filters must be string-encoded JSON, NOT JavaScript objects**

**Common Error Patterns to Avoid:**
❌ filters: {op: "in", content: {field: "cases.project.project_id", value: ["TARGET-NBL"]}}
✅ filters: "{\\\"op\\\":\\\"in\\\",\\\"content\\\":{\\\"field\\\":\\\"cases.project.project_id\\\",\\\"value\\\":[\\\"TARGET-NBL\\\"]}}"

❌ Using 'cases' directly in root query
✅ Use 'viewer { repository { cases { ... } } }' or 'projects { ... }' for root queries

**Required Query Structure for Cases:**
\`\`\`graphql
query {
  viewer {
    repository {
      cases {
        hits(filters: "FILTER_STRING_HERE", first: 100) {
          edges {
            node {
              case_id
              primary_site
              disease_type
              demographic { gender race ethnicity }
              diagnoses {
                hits(first: 1) {
                  edges {
                    node {
                      age_at_diagnosis
                      primary_diagnosis
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

**Field Location Guide:**
- **Case level**: case_id, primary_site, disease_type
- **Demographic**: gender, race, ethnicity, year_of_birth (NOTE: vital_status and days_to_death are NOT here)
- **Diagnoses**: age_at_diagnosis, primary_diagnosis, last_known_disease_status
- **Vital status info**: Use follow_ups node or check diagnosis.last_known_disease_status

**Working Examples:**

1. **Get all TARGET-NBL cases:**
\`\`\`graphql
query {
  viewer {
    repository {
      cases {
        hits(filters: "{\\\"op\\\":\\\"in\\\",\\\"content\\\":{\\\"field\\\":\\\"cases.project.project_id\\\",\\\"value\\\":[\\\"TARGET-NBL\\\"]}}", first: 100) {
          edges {
            node {
              case_id
              primary_site
              disease_type
            }
          }
        }
      }
    }
  }
}
\`\`\`

2. **Projects query (no viewer wrapper needed):**
\`\`\`graphql
query {
  projects {
    hits(first: 100) {
      edges {
        node {
          project_id
          name
          primary_site
          disease_type
        }
      }
    }
  }
}
\`\`\`

**Before writing complex queries, ALWAYS:**
1. Use introspection to discover available fields
2. Check field locations with: { __type(name: "Case") { fields { name } } }
3. Test with simple queries first, then add complexity

If you get syntax errors, the most common causes are:
- Filters not string-encoded
- Wrong query structure (missing viewer/repository for cases)
- Requesting fields that don't exist on that type`,
			{
				query: z.string().describe(
					`The GraphQL query string to execute against the NCI GDC GraphQL API.

**CRITICAL REQUIREMENTS:**
- For cases: Use 'viewer { repository { cases { ... } } }' structure
- For projects: Use 'projects { ... }' directly
- Filters MUST be string-encoded JSON when used inline
- Always check field existence with introspection first

**Examples:**
- Introspection: '{ __type(name: "Case") { fields { name } } }'
- Cases: 'query { viewer { repository { cases { hits(filters: "{\\"op\\":\\"in\\",\\"content\\":{\\"field\\":\\"cases.project.project_id\\",\\"value\\":[\\"TARGET-NBL\\"]}}", first: 10) { edges { node { case_id } } } } } } }'
- Projects: 'query { projects { hits(first: 10) { edges { node { project_id name } } } } }'`
				),
				variables: z
					.record(z.any())
					.optional()
					.describe(
						`Optional dictionary of variables for the GraphQL query. When using variables, filters should be properly formatted JSON objects (not strings).

**Correct variable format:**
{ "filters": { "op": "in", "content": { "field": "cases.project.project_id", "value": ["TARGET-NBL"] } } }

**Use variables when:**
- Query has $filters parameter
- You want cleaner, reusable queries
- Working with complex filter logic`
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


// Export the fetch handler, standard for environments like Cloudflare Workers or Deno Deploy.
export default {
	async fetch(request: Request, env: Record<string, DurableObjectNamespace<McpAgent<unknown, unknown, Record<string, unknown>>>>, ctx: { waitUntil(promise: Promise<any>): void; passThroughOnException(): void; props: any }): Promise<Response> {
		const url = new URL(request.url);

		// Streamable HTTP transport is primary
		if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
			// @ts-ignore McpAgent provides serve method
			const httpHandler = NciGdcMCP.serve("/mcp");
			return httpHandler.fetch(request, env, ctx);
		}

		// SSE transport
		if (url.pathname === "/sse" || url.pathname.startsWith("/sse/")) {
			// @ts-ignore McpAgent provides serveSSE method
			const sseHandler = NciGdcMCP.serveSSE("/sse");
			return sseHandler.fetch(request, env, ctx);
		}

		// Fallback for unhandled paths
		console.error(
			`NCI GDC MCP Server. Requested path ${url.pathname} not found. Available endpoints: /mcp (HTTP), /sse (SSE).`
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