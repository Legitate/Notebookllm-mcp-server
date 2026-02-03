import os
import subprocess
import time

# Configuration
EXTENSION_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PROFILE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'mcp-profile'))
CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"  # MacOS Default

def launch_chrome_visible():
    print(f"Profile Directory: {PROFILE_DIR}")
    print(f"Extension Path: {EXTENSION_PATH}")
    
    args = [
        CHROME_PATH,
        f"--user-data-dir={PROFILE_DIR}",
        f"--load-extension={EXTENSION_PATH}",
        "--no-first-run",
        "--no-default-browser-check"
        # Removed --headless=new to make it visible
    ]
    
    print("\nLaunching Chrome for Setup...")
    print("1. Please log in to NotebookLM (https://notebooklm.google.com)")
    print("2. Ensure the extension icon appears and is active.")
    print("3. Close this Chrome window when done.")
    
    subprocess.Popen(args)

if __name__ == "__main__":
    launch_chrome_visible()
