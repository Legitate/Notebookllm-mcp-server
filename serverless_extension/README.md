# NotebookLM Infographic Generator (Serverless)

This Chrome Extension works as a standalone tool to generate infographics from YouTube videos using your active NotebookLM session.

[GitHub Repository](https://github.com/Legitate/serverless-extension)

## Features
-   **No Background Server**: Logic runs entirely within the browser.
-   **Automatic Authentication**: Uses your active login cookie from `notebooklm.google.com`.
-   **Direct Generation**: Creates a notebook, adds the video, and runs the infographic tool automatically.

## Files Structure
-   `manifest.json`: Configuration and permissions.
-   `background.js`: Contains the NotebookLM API client and logic.
-   `content.js`: Handles the YouTube overlay UI.
-   `popup.html` / `popup.js`: The extension popup menu.
-   `images/`: Icons.

## Installation

1.  Open **Chrome** and navigate to `chrome://extensions`.
2.  Enable **Developer mode** (toggle in the top right).
3.  Click **Load unpacked**.
4.  Select this folder (`serverless_extension`).

## Usage

1.  **Log in to NotebookLM**: Go to [notebooklm.google.com](https://notebooklm.google.com) and sign in.
2.  **Open YouTube**: Go to any YouTube video page.
3.  **Generate**: Click "Generate Infographic" on the overlay panel.
4.  **Wait**: The process takes 2-3 minutes. You can check progress by inspecting the Extension's service worker console.
