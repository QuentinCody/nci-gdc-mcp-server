# NCI GDC MCP Server: Easy Access for Scientists

This server lets you explore and analyze data from the National Cancer Institute (NCI) Genomic Data Commons (GDC) using natural language tools like Claude Desktop or other Model Context Protocol (MCP) clients. You do **not** need to be a programmer to use it!

---

## What is this?

- **MCP Server**: A bridge that lets you ask questions about cancer genomics data using AI tools.
- **NCI GDC**: A large database of cancer genomics data from the National Cancer Institute.
- **Claude Desktop**: An AI assistant you can run on your computer, which can connect to this server to answer your questions about GDC data.

---

## How to Use This Server with Claude Desktop

### 1. Start the MCP Server

Ask your technical support or IT to start the server for you, or follow their instructions. By default, it will be available at:

```
http://localhost:8787/sse
```

### 2. Connect Claude Desktop to the Server

1. Open Claude Desktop.
2. Go to **Settings > Developer > Edit Config**.
3. Add this to your configuration (ask for help if you are unsure):

```json
{
  "mcpServers": {
    "nci-gdc-local": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:8787/sse"
      ]
    }
  }
}
```

4. Save and restart Claude Desktop.
5. In Claude, select the "nci-gdc-local" server from the MCP menu.

---

## What Can I Do?

- **Ask questions about cancer genomics data** (e.g., "Show me all projects related to kidney cancer.")
- **Explore available data types and fields** (e.g., "What fields are available for cases?")
- **Get summaries, counts, and more**

If you are not sure what to ask, try:
- "List all available data types in the GDC."
- "How many cases are there for breast cancer?"
- "Show me the schema for the 'Project' type."

---

## Need Help?

- If you have trouble connecting, ask your IT or technical support for help.
- For more information about the GDC, visit: https://gdc.cancer.gov/
- For more about Claude Desktop and MCP, see: https://modelcontextprotocol.io/quickstart/user

---

*This server is designed to make cancer genomics data accessible to everyone. No programming required!*
