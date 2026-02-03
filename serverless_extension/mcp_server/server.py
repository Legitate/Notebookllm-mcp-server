import asyncio
import json
import logging
import os
import subprocess
import sys
import websockets
from mcp.server.fastmcp import FastMCP

# Configuration
WS_PORT = 18000
EXTENSION_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PROFILE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'mcp-profile'))
CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"  # MacOS Default

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(os.path.dirname(__file__), 'server.log')),
        logging.StreamHandler(sys.stderr)
    ]
)
logger = logging.getLogger("mcp-server")

# Initialize MCP
mcp = FastMCP("Infographic Generator")

# Global State
connected_extension = None
generation_futures = {}
chrome_process = None

@mcp.tool()
async def generate_infographic(url: str) -> str:
    """
    Generate an infographic from a YouTube video URL using NotebookLM.
    Returns the URL of the generated image.
    """
    if not connected_extension:
        logger.error("Request received but extension NOT connected.")
        raise RuntimeError("Chrome Extension is not connected. Is Chrome running?")

    future = asyncio.get_running_loop().create_future()
    request_id = str(os.urandom(4).hex())
    generation_futures[request_id] = future

    # Send command to extension
    command = {
        "type": "GENERATE",
        "url": url,
        "requestId": request_id
    }
    
    try:
        await connected_extension.send(json.dumps(command))
        logger.info(f"Sent generation request {request_id} for {url}")
        
        # Wait for result
        result = await future
        return result
        
    except Exception as e:
        if request_id in generation_futures:
            del generation_futures[request_id]
        raise RuntimeError(f"Generation failed: {str(e)}")

@mcp.tool()
async def list_notebooks() -> str:
    """
    List all notebooks available in the connected NotebookLM account.
    Returns a JSON string containing a list of objects with 'id' and 'title'.
    """
    if not connected_extension:
        raise RuntimeError("Chrome Extension is not connected. Is Chrome running?")

    future = asyncio.get_running_loop().create_future()
    request_id = str(os.urandom(4).hex())
    generation_futures[request_id] = future

    command = {
        "type": "LIST_NOTEBOOKS",
        "requestId": request_id
    }

    try:
        await connected_extension.send(json.dumps(command))
        result = await future
        return json.dumps(result, indent=2)
    except Exception as e:
        if request_id in generation_futures:
            del generation_futures[request_id]
        raise RuntimeError(f"List notebooks failed: {str(e)}")

@mcp.tool()
async def get_notebook_content(notebook_id: str) -> str:
    """
    Get the content of a specific notebook, including its sources.
    Returns a JSON string with the notebook content.
    """
    if not connected_extension:
        raise RuntimeError("Chrome Extension is not connected. Is Chrome running?")

    future = asyncio.get_running_loop().create_future()
    request_id = str(os.urandom(4).hex())
    generation_futures[request_id] = future

    command = {
        "type": "GET_NOTEBOOK_CONTENT",
        "notebookId": notebook_id,
        "requestId": request_id
    }

    try:
        await connected_extension.send(json.dumps(command))
        result = await future
        return json.dumps(result, indent=2)
    except Exception as e:
        if request_id in generation_futures:
            del generation_futures[request_id]
        raise RuntimeError(f"Get notebook content failed: {str(e)}")

async def ws_handler(websocket):
    global connected_extension
    connected_extension = websocket
    logger.info("Extension Connected!")
    
    try:
        async for message in websocket:
            data = json.loads(message)
            msg_type = data.get("type")
            
            if msg_type == "GENERATION_COMPLETE" or msg_type == "TOOL_COMPLETE":
                req_id = data.get("requestId")
                # For GENERATION_COMPLETE, result is in imageUrl. For TOOL_COMPLETE, it's in result.
                result_data = data.get("imageUrl") if msg_type == "GENERATION_COMPLETE" else data.get("result")
                error = data.get("error")
                
                if req_id in generation_futures:
                    fut = generation_futures[req_id]
                    if error:
                        fut.set_exception(RuntimeError(error))
                    else:
                        fut.set_result(result_data)
                    del generation_futures[req_id]
                    
            elif msg_type == "HEARTBEAT":
                pass
                
    except websockets.exceptions.ConnectionClosed:
        logger.info("Extension Disconnected")
    finally:
        connected_extension = None

async def start_ws_server():
    try:
        async with websockets.serve(ws_handler, "localhost", WS_PORT):
            logger.info(f"WebSocket Server listening on port {WS_PORT}")
            await asyncio.Future()  # Run forever
    except OSError as e:
        logger.error(f"Failed to start WebSocket server on port {WS_PORT}. Is another instance running? Error: {e}")
    except Exception as e:
        logger.error(f"WebSocket server error: {e}")

def launch_chrome(headless=True):
    args = [
        CHROME_PATH,
        f"--user-data-dir={PROFILE_DIR}",
        f"--load-extension={EXTENSION_PATH}",
        "--no-first-run",
        "--no-default-browser-check"
    ]
    
    if headless:
        args.append("--headless=new")
        
    logger.info(f"Launching Chrome (Headless: {headless})...")
    global chrome_process
    chrome_process = subprocess.Popen(args)

if __name__ == "__main__":
    # Check for visible flag (Default to TRUE for debugging)
    visible = True # "--visible" in sys.argv
    
    # 1. Start Chrome
    launch_chrome(headless=not visible)
    
    # 2. Start WebSocket Server (Background Task)
    async def main():
        # Start WS Server as a task
        server_task = asyncio.create_task(start_ws_server())
        
        # Start MCP 
        await mcp.run_stdio_async()

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Stopping...")
    finally:
        logger.info("Cleaning up...")
        if chrome_process:
            logger.info("Terminating Chrome...")
            chrome_process.terminate()
            try:
                chrome_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                chrome_process.kill()
            logger.info("Chrome terminated.")
