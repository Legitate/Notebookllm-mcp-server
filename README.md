# NotebookLM MCP Server - Setup Instructions

This guide explains how to set up the NotebookLM integration on a new machine.

## 1. Prerequisites
Ensure you have **Python 3.10+** installed.

## 2. Install Dependencies
Open a terminal in this project folder and run:

```bash
pip install -r serverless_extension/mcp_server/requirements.txt
```

## 3. Configure Claude Desktop
1.  Open **Claude Desktop**.
2.  Go to `Settings` -> `Developer` -> `Edit Config`.
3.  Copy the content from the file `claude_config_template.json` (located in this folder).
4.  **CRITICAL:** Update the path in the config to match the location of this folder on *your* computer.
    *   Change `/ABSOLUTE/PATH/TO/...` to the full path of `google-extension-main`.

## 4. How to Use
**You do NOT need to run any server commands manually.**

1.  Open Claude Desktop.
2.  Simply ask it to "List my notebooks" or "Generate an infographic".
3.  Claude will automatically:
    *   Start the Python server in the background.
    *   Launch a managed Chrome instance (visible mode) with **the extension automatically loaded**.
    *   Ask you to **Log In to NotebookLM** in that Chrome window (first time only).
4.  Once logged in, the tools will work instantly!

## Safety Note
*   User profiles are **not** shared. You will log in with your own Google account.
*   The `.gitignore` file ensures no personal session data is committed to the repository.
