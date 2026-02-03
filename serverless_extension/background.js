// background.js (Serverless)

const NOTEBOOKLM_BASE = "https://notebooklm.google.com";
let currentYouTubeUrl = null;

// --- WEB SOCKET BRIDGE ---
let ws = null;
let reconnectInterval = 5000;

function connectWebSocket() {
    console.log("Attempting WebSocket Connection...");
    ws = new WebSocket('ws://127.0.0.1:18000');

    ws.onopen = () => {
        console.log("Connected to MCP Server");
        ws.send(JSON.stringify({ type: 'HEARTBEAT' }));
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'GENERATE') {
                console.log("Received MCP Generate Command:", data);
                // Trigger Generation
                runGenerationFlow(data.url, "Requested by Agent")
                    .then(res => {
                        ws.send(JSON.stringify({
                            type: 'GENERATION_COMPLETE',
                            requestId: data.requestId,
                            imageUrl: res.imageUrl,
                            error: res.error
                        }));
                    })
                    .catch(e => {
                        ws.send(JSON.stringify({
                            type: 'GENERATION_COMPLETE',
                            requestId: data.requestId,
                            error: e.message
                        }));
                    });
            } else if (data.type === 'LIST_NOTEBOOKS') {
                console.log("Received LIST_NOTEBOOKS command");
                const requestId = data.requestId;
                // Create a client instance specifically for this request or reuse a global one?
                // Ideally reuse, but creating new is safer for state isolation in this context.
                const client = new NotebookLMClient(); // Ensure we have an instance

                client.init().then(async () => {
                    const notebooks = await client.listNotebooks();
                    ws.send(JSON.stringify({
                        type: 'TOOL_COMPLETE',
                        requestId: requestId,
                        result: notebooks
                    }));
                }).catch(err => {
                    ws.send(JSON.stringify({
                        type: 'TOOL_COMPLETE',
                        requestId: requestId,
                        error: err.message
                    }));
                });
            } else if (data.type === 'GET_NOTEBOOK_CONTENT') {
                console.log("Received GET_NOTEBOOK_CONTENT command");
                const requestId = data.requestId;
                const notebookId = data.notebookId;
                const client = new NotebookLMClient();

                client.init().then(async () => {
                    const content = await client.getNotebookContent(notebookId);
                    ws.send(JSON.stringify({
                        type: 'TOOL_COMPLETE',
                        requestId: requestId,
                        result: content
                    }));
                }).catch(err => {
                    ws.send(JSON.stringify({
                        type: 'TOOL_COMPLETE',
                        requestId: requestId,
                        error: err.message
                    }));
                });
            }
        } catch (e) {
            console.error("WS Message Error:", e);
        }
    };

    ws.onclose = () => {
        console.log("WS Disconnected. Retrying in 5s...");
        setTimeout(connectWebSocket, reconnectInterval);
    };

    ws.onerror = (e) => {
        // console.error("WS Error:", e); 
    };
}

// Start connection logic
connectWebSocket();

// --- INIT & LISTENERS ---

chrome.runtime.onInstalled.addListener(async () => {
    chrome.action.disable();

    // 1. Clean Stale States (Reset any "RUNNING" states to "FAILED" so UI unlocks)
    const result = await chrome.storage.local.get(['infographicStates']);
    const states = result.infographicStates || {};
    let hasChanges = false;

    for (const [videoId, state] of Object.entries(states)) {
        if (state.status === 'RUNNING' || state.status === 'AUTH_PENDING') {
            console.log(`Resetting stale state for video ${videoId}`);
            states[videoId] = { ...state, status: 'FAILED', error: 'Extension reloaded' };
            hasChanges = true;
        }
    }

    if (hasChanges) {
        await chrome.storage.local.set({ infographicStates: states });
    }

    // 2. Clear Global Sticky ID if it was RUNNING
    // Actually, let's just leave the sticky ID, but since we reset the state object above, 
    // the UI will see 'FAILED' instead of 'RUNNING' and unlock.

    // 3. Re-inject Content Script & Enable Action
    const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
    for (const tab of tabs) {
        try {
            chrome.action.enable(tab.id);
            // Re-inject content script to revive UI on existing tabs
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
        } catch (e) {
            console.log(`Could not inject into tab ${tab.id}:`, e);
        }
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'YOUTUBE_ACTIVE') {
        const tabId = sender.tab.id;
        currentYouTubeUrl = message.url;
        chrome.action.enable(tabId);
        sendResponse({ status: 'enabled' });

    } else if (message.type === 'GENERATE_INFOGRAPHIC') {
        runGenerationFlow(message.url, message.title)
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    } else if (message.type === 'DOWNLOAD_IMAGE') {
        chrome.downloads.download({
            url: message.url,
            filename: message.filename
        });
    } else if (message.type === 'GENERATE_QUEUE_INFOGRAPHIC') {
        runQueueGenerationFlow(message.queue, message.mode) // Pass mode
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

// --- KEEP ALIVE (OFFSCREEN) ---
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

async function setupOffscreenDocument(path) {
    const offscreenUrl = chrome.runtime.getURL(path);

    // Check if it already exists
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
        return;
    }

    // Try to create it, ignoring if it already exists or fails for other reasons
    try {
        await chrome.offscreen.createDocument({
            url: path,
            reasons: ['BLOBS'],
            justification: 'Keep service worker alive for long-running processes',
        });
    } catch (e) {
        console.warn("Offscreen document creation failed (likely already exists):", e);
    }
}

chrome.runtime.onStartup.addListener(async () => {
    await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
});

// Also run on simple load/reload
setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH).catch(console.warn);

chrome.runtime.onMessage.addListener((msg) => {
    if (msg === 'keepAlive') {
        // Just receiving the message keeps SW alive
        // console.log('Keep-alive ping received');
    }
});

// --- CONTENT SCRIPT KEEP ALIVE (Legacy/Backup) ---
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'keepAlive') {
        port.onMessage.addListener((msg) => {
            if (msg.type === 'ping') {
                // Heartbeat
            }
        });
    }
});

// --- CORE FLOW ---

async function runGenerationFlow(url, title) {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    await updateState(videoId, { status: 'RUNNING', operation_id: Date.now(), title: title });
    // PERSISTENCE FIX: Save this video as the active one so UI recovers if tab is closed
    await chrome.storage.local.set({ lastActiveVideoId: videoId });
    broadcastStatus(url, "RUNNING");

    // Daily Limit Check moved to execution phase (if opId is missing)

    // Sanitize URL (NotebookLM dislikes playlists/mixes)
    // const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

    try {
        // 1. Get Params & Auth
        const client = new NotebookLMClient();
        await client.init(); // Auto-auth using cookies

        // 2. Create Notebook
        console.log("Creating Notebook...");
        const notebookId = await client.createNotebook("Infographic Gen");
        console.log("Notebook ID:", notebookId);

        // 3. Add Source
        console.log("Adding Source...");
        const sourceData = await client.addSource(notebookId, url);
        const sourceId = sourceData.source_id;
        console.log("Source ID:", sourceId);

        // Wait a bit for ingestion
        await new Promise(r => setTimeout(r, 5000));

        // 4. Run Infographic Tool
        console.log("Running Infographic Tool...");
        const opId = await client.runInfographicTool(notebookId, sourceId);
        console.log("Operation ID:", opId);

        if (!opId) {
            await updateState(videoId, { status: 'LIMIT_EXCEEDED', error: "Your daily limit is over try after 24 hrs" });
            broadcastStatus(url, "LIMIT_EXCEEDED");
            return { success: false, error: "Daily limit exceeded" };
        }

        // 5. Poll for Result
        console.log("Polling for result...");
        const imageUrl = await client.waitForInfographic(notebookId, opId);
        console.log("Success! Image:", imageUrl);

        await updateState(videoId, { status: 'COMPLETED', image_url: imageUrl });
        broadcastStatus(url, "COMPLETED", { image_url: imageUrl });

        return { success: true, imageUrl: imageUrl };

    } catch (e) {
        console.error("Generation Failed:", e);
        const rawError = e.message || "Unknown error";
        const friendlyError = getUserFriendlyError(rawError);

        // Handle Auth Error specifically
        if (friendlyError.type === 'AUTH') {
            await updateState(videoId, { status: 'AUTH_REQUIRED', error: friendlyError.message });
            broadcastStatus(url, "AUTH_EXPIRED");
        } else if (friendlyError.type === 'LIMIT') {
            await updateState(videoId, { status: 'LIMIT_EXCEEDED', error: friendlyError.message });
            broadcastStatus(url, "LIMIT_EXCEEDED", { error: friendlyError.message });
        } else {
            await updateState(videoId, { status: 'FAILED', error: friendlyError.message });
            broadcastStatus(url, "FAILED", { error: friendlyError.message });
        }
        throw e;
    }
}

function getUserFriendlyError(rawError) {
    const errorLower = rawError.toLowerCase();

    if (errorLower.includes("401") || errorLower.includes("authentication failed") || errorLower.includes("log in")) {
        return { type: 'AUTH', message: "Session expired. Please log in to NotebookLM again." };
    }
    if (errorLower.includes("failed to fetch") || errorLower.includes("network")) {
        return { type: 'NETWORK', message: "Connection failed. Please check your internet." };
    }
    if (errorLower.includes("daily limit") || errorLower.includes("limit exceeded")) {
        return { type: 'LIMIT', message: "Daily generation limit reached. Please try again tomorrow." };
    }
    if (errorLower.includes("failed to add source")) {
        return { type: 'SOURCE', message: "Could not add this video. It might be private, too long, or age-restricted." };
    }
    if (errorLower.includes("timed out") || errorLower.includes("timeout")) {
        return { type: 'TIMEOUT', message: "Generation took too long. Servers might be busy. Please try again." };
    }

    // Default fallback
    return { type: 'UNKNOWN', message: rawError }; // Keep original if specific match not found, or maybe generic?
    // Let's keep rawError for now so we don't hide useful debug info if it's something valid.
}


async function runQueueGenerationFlow(queue, mode = 'separate') {
    if (!queue || queue.length === 0) return;

    // Use the first video ID as the "primary" key for locking the UI initially?
    const primaryVideoId = queue[0].videoId;
    await chrome.storage.local.set({ lastActiveVideoId: primaryVideoId });

    // Initialize Client
    const client = new NotebookLMClient();
    try {
        await client.init();
    } catch (e) {
        broadcastStatus(null, "FAILED", { error: e.message });
        return { success: false, error: e.message };
    }

    if (mode === 'merged') {
        // --- MERGED MODE ---
        try {
            // Mark all items as RUNNING
            for (const item of queue) {
                broadcastStatus(null, "QUEUE_UPDATE", { videoId: item.videoId, status: 'RUNNING', message: 'Merging...' });
                await updateState(item.videoId, { status: 'RUNNING', operation_id: Date.now(), title: item.title });
            }

            // 1. Create One Notebook
            const notebookId = await client.createNotebook(`Infographic Queue Merged (${queue.length})`);
            console.log("Merged Notebook ID:", notebookId);

            // 2. Add All Sources
            let allSourceIds = [];
            for (let i = 0; i < queue.length; i++) {
                const item = queue[i];
                console.log(`Adding source ${i + 1}/${queue.length}: ${item.url}`);
                broadcastStatus(null, "QUEUE_UPDATE", { videoId: item.videoId, status: 'RUNNING', message: 'Adding...' });

                const sourceData = await client.addSource(notebookId, item.url);
                if (sourceData && sourceData.source_id) {
                    allSourceIds.push(sourceData.source_id);
                }

                // Pause to prevent rate limiting
                await new Promise(r => setTimeout(r, 2000));
            }

            console.log(`Collected ${allSourceIds.length} sources for merged generation.`);

            // Ingestion Wait
            await new Promise(r => setTimeout(r, 6000));

            // 3. Run Tool Once
            console.log("Running Infographic Tool on Merged Batch...");
            // Update status to show "Generating" for all
            for (const item of queue) {
                broadcastStatus(null, "QUEUE_UPDATE", { videoId: item.videoId, status: 'RUNNING', message: 'Generating...' });
            }

            const opId = await client.runInfographicTool(notebookId, allSourceIds);
            if (!opId) throw new Error("Limit exceeded or tool failed");

            // 4. Poll Result
            const imageUrl = await client.waitForInfographic(notebookId, opId);

            // 5. Complete All
            for (const item of queue) {
                await updateState(item.videoId, { status: 'COMPLETED', image_url: imageUrl, title: item.title });
                broadcastStatus(null, "QUEUE_UPDATE", {
                    videoId: item.videoId,
                    status: 'COMPLETED',
                    imageUrl: imageUrl
                });
            }

        } catch (e) {
            console.error("Merged Queue Failed:", e);
            const userError = getUserFriendlyError(e.message || "");
            const finalStatus = userError.type === 'LIMIT' ? 'LIMIT_EXCEEDED' : 'FAILED';

            for (const item of queue) {
                // If parsing failed, pass raw message
                const errorMsg = userError.message || e.message;

                await updateState(item.videoId, { status: finalStatus, error: errorMsg });
                broadcastStatus(null, "QUEUE_UPDATE", {
                    videoId: item.videoId,
                    status: finalStatus,
                    error: errorMsg
                });
            }

            // If it's a critical limit error, strictly throw/broadcast it globally 
            if (finalStatus === 'LIMIT_EXCEEDED') {
                broadcastStatus(null, "LIMIT_EXCEEDED", { error: userError.message });
            }

            throw e;
        }

    } else {
        // --- SEPARATE MODE (Existing Logic) ---
        for (let i = 0; i < queue.length; i++) {
            const item = queue[i];
            console.log(`Processing Queue Item ${i + 1}/${queue.length}: ${item.title}`);

            broadcastStatus(null, "QUEUE_UPDATE", {
                videoId: item.videoId,
                status: 'RUNNING',
                message: 'Creating Notebook...'
            });
            await chrome.storage.local.set({ lastActiveVideoId: item.videoId });
            await updateState(item.videoId, { status: 'RUNNING', operation_id: Date.now(), title: item.title });

            try {
                // 1. Create Notebook
                const notebookId = await client.createNotebook(`Infographic: ${item.title.substring(0, 50)}`);
                console.log("Notebook ID:", notebookId);

                // 2. Add Source
                broadcastStatus(null, "QUEUE_UPDATE", { videoId: item.videoId, status: 'RUNNING', message: 'Adding Source...' });
                const sourceData = await client.addSource(notebookId, item.url);
                const sourceId = sourceData.source_id;

                await new Promise(r => setTimeout(r, 5000));

                // 3. Run Tool
                broadcastStatus(null, "QUEUE_UPDATE", { videoId: item.videoId, status: 'RUNNING', message: 'Generating Infographic...' });
                const opId = await client.runInfographicTool(notebookId, sourceId);

                if (!opId) throw new Error("Limit exceeded or tool failed");

                // 4. Poll Result
                const imageUrl = await client.waitForInfographic(notebookId, opId);

                // 5. Complete
                await updateState(item.videoId, { status: 'COMPLETED', image_url: imageUrl, title: item.title });
                broadcastStatus(null, "QUEUE_UPDATE", {
                    videoId: item.videoId,
                    status: 'COMPLETED',
                    imageUrl: imageUrl
                });

            } catch (e) {
                console.error(`Failed item ${item.title}:`, e);
                const userError = getUserFriendlyError(e.message || "");
                const finalStatus = userError.type === 'LIMIT' ? 'LIMIT_EXCEEDED' : 'FAILED';
                const errorMsg = userError.message || e.message;

                await updateState(item.videoId, { status: finalStatus, error: errorMsg });
                broadcastStatus(null, "QUEUE_UPDATE", {
                    videoId: item.videoId,
                    status: finalStatus,
                    error: errorMsg
                });

                if (finalStatus === 'LIMIT_EXCEEDED') {
                    // If limit hit during sequential, break loop?
                    // Yes, stop processing further items.
                    broadcastStatus(null, "LIMIT_EXCEEDED", { error: errorMsg });
                    break;
                }
            }

            if (i < queue.length - 1) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }

    return { success: true };
}


// --- CLIENT IMPLEMENTATION ---

class NotebookLMClient {
    constructor() {
        this.f_sid = null;
        this.bl = null;
        this.at_token = null; // We might not need this if cookies work magically, but usually SN requires f.req w/ tokens
        this.req_id = Math.floor(Math.random() * 900000) + 100000;
    }

    async init() {
        console.log("Initializing NotebookLM Client...");
        // Fetch homepage to scrape params
        let response;
        try {
            response = await fetch(`${NOTEBOOKLM_BASE}/`);
        } catch (e) {
            console.error("Init Fetch Error:", e);
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                throw new Error("Authentication failed. Please log in to NotebookLM.");
            }
            throw e;
        }

        console.log(`NotebookLM Homepage Fetch Status: ${response.status}`);

        // Check for redirect to login page
        if (response.url.includes("accounts.google.com") || response.url.includes("ServiceLogin")) {
            throw new Error("Authentication failed. Please log in to NotebookLM.");
        }

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) throw new Error("Authentication failed. Please log in to NotebookLM.");
            throw new Error("Failed to reach NotebookLM: " + response.status);
        }

        const text = await response.text();
        console.log(`Fetched Homepage Content Length: ${text.length}`);

        // Scrape FdrFJe (f.sid)
        // Try multiple regex patterns just in case
        let matchSid = text.match(/"FdrFJe":"([-0-9]+)"/);
        if (!matchSid) {
            // Fallback: try looking for WIZ_global_data structure loosely
            console.log("Regex 1 failed, trying fallback...");
            matchSid = text.match(/FdrFJe\\":\\"([-0-9]+)\\"/); // Escaped JSON scenario
        }

        this.f_sid = matchSid ? matchSid[1] : null;
        console.log(`Found f.sid: ${this.f_sid ? "YES" : "NO"} (${this.f_sid})`);

        // Scrape bl
        const matchBl = text.match(/"(boq_[^"]+)"/);
        this.bl = matchBl ? matchBl[1] : "boq_labs-tailwind-frontend_20260101.17_p0";
        console.log(`Found bl: ${this.bl}`);

        // Scrape SNlM0e (at_token) - sometimes needed
        const matchAt = text.match(/"SNlM0e":"([^"]+)"/);
        this.at_token = matchAt ? matchAt[1] : null;

        if (!this.f_sid) {
            console.error("CRITICAL: Could not find f.sid in homepage content. Auth will fail.");
            throw new Error("Authentication failed. Please log in to NotebookLM.");
        }
    }

    getReqId() {
        this.req_id += 1000;
        return this.req_id.toString();
    }

    async executeRpc(rpcId, payload) {
        if (!this.f_sid) await this.init();

        const url = `${NOTEBOOKLM_BASE}/_/LabsTailwindUi/data/batchexecute`;
        const f_req = JSON.stringify([[[rpcId, JSON.stringify(payload), null, "generic"]]]);

        const params = new URLSearchParams({
            "rpcids": rpcId,
            "f.sid": this.f_sid,
            "bl": this.bl,
            "hl": "en-GB",
            "_reqid": this.getReqId(),
            "rt": "c"
        });

        const formData = new URLSearchParams();
        formData.append("f.req", f_req);
        if (this.at_token) formData.append("at", this.at_token);
        console.log(`Executing RPC ${rpcId} (AT Token present: ${this.at_token ? 'YES' : 'NO'})`);

        const response = await fetch(`${url}?${params.toString()}`, {
            method: "POST",
            body: formData,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
            }
        });

        if (response.status === 401 || response.status === 403) {
            throw new Error("Authentication failed (401)");
        }

        const text = await response.text();
        console.log(`RPC ${rpcId} Raw Response (${text.length} chars):`, text.substring(0, 2000));
        const parsed = this.parseEnvelope(text, rpcId);

        // Debug Log only for addSource failure investigation
        if (rpcId === 'izAoDd') {
            console.log(`RPC izAoDd Response Preview: ${JSON.stringify(parsed).substring(0, 500)}`);
        }

        return parsed;
    }

    parseEnvelope(text, rpcId) {
        // ... (existing parseEnvelope)
        if (text.startsWith(")]}'")) text = text.substring(4);

        const lines = text.split('\n');
        let results = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
                if (trimmed.startsWith('[')) {
                    const obj = JSON.parse(trimmed);
                    if (Array.isArray(obj)) results.push(obj);
                }
            } catch (e) { }
        }

        const validObjects = results.flat();

        for (const chunk of validObjects) {
            // Case 1: Flat structure ["wrb.fr", "rpcId", "payload"]
            // This is what we see in the user's logs
            if (chunk[0] === 'wrb.fr' && chunk[1] === rpcId) {
                const payload = chunk[2];
                if (payload) {
                    try {
                        return JSON.parse(payload);
                    } catch (e) {
                        return payload;
                    }
                }
            }

            // Case 2: Nested header structure (legacy or different RPC type)
            // [["wrb.fr", "rpcId", ...], payload]
            if (Array.isArray(chunk[0]) && chunk[0][0] === 'wrb.fr' && chunk[0][1] === rpcId) {
                // Payload is usually at index 2, but sometimes 1 if structure is tight
                const payload = chunk[2];
                if (payload) {
                    try {
                        return JSON.parse(payload);
                    } catch (e) {
                        return payload;
                    }
                }
            }
        }
    }

    async listNotebooks() {
        console.log("NotebookLMClient: Listing notebooks...");
        const rpcId = "wXbhsf";
        const payload = [null, 1, null, [2]];

        let response;
        try {
            response = await this.executeRpc(rpcId, payload);
            console.log("NotebookLMClient: List RPC executed. Response type:", typeof response);
            if (response) {
                console.log("NotebookLMClient: Response preview:", JSON.stringify(response).substring(0, 1000));
            }
        } catch (err) {
            console.error("NotebookLMClient: List RPC failed:", err);
            throw err;
        }

        // Response parsing logic for wXbhsf
        // Based on HAR, the structure is deeply nested.
        // We look for the main list array.
        const notebooks = [];
        try {
            // Traverse response to find the list.
            function findNotebooks(obj) {
                if (!obj || typeof obj !== 'object') return;

                if (Array.isArray(obj)) {
                    // Log array length for debugging occasional nodes
                    // if (obj.length > 2 && typeof obj[2] === 'string' && obj[2].length === 36) console.log("Checking potential match:", obj);

                    // Corrected structure based on HAR analysis:
                    // Index 0: Title (string)
                    // Index 2: UUID (string, 36 chars)
                    // Example: ["Title", [...], "uuid-...", ...]
                    if (obj.length > 2 && typeof obj[0] === 'string' && typeof obj[2] === 'string' &&
                        obj[2].length === 36 && obj[2].split('-').length === 5) {
                        const id = obj[2];
                        const title = obj[0] || "Untitled Notebook"; // Handle empty titles

                        // UUID check
                        if ((id.match(/-/g) || []).length === 4) {
                            console.log("Found match:", title, id);
                            notebooks.push({
                                id: id,
                                title: title
                            });
                        }
                    }
                    obj.forEach(findNotebooks);
                } else {
                    Object.values(obj).forEach(findNotebooks);
                }
            }
            findNotebooks(response);
            console.log(`NotebookLMClient: Found ${notebooks.length} notebooks`);
        } catch (e) {
            console.error("Error parsing listNotebooks response:", e);
        }
        return notebooks;
    }

    async getNotebookContent(notebookId) {
        const rpcId = "gArtLc";
        const innerPayload = [[2], notebookId, "NOT artifact.status = \"ARTIFACT_STATUS_SUGGESTED\""];
        const response = await this.executeRpc(rpcId, innerPayload);

        const content = {
            notebookId: notebookId,
            sources: [],
            text_blocks: []
        };

        try {
            function processNode(obj) {
                if (!obj || typeof obj !== 'object') return;

                if (Array.isArray(obj)) {
                    // Check for Sources: [uuid, title, ...]
                    if (obj.length > 2 && typeof obj[0] === 'string' && typeof obj[1] === 'string' && obj[0].length === 36) {
                        // Simple check if it looks like a Source ID
                        if ((obj[0].match(/-/g) || []).length === 4) {
                            content.sources.push({
                                id: obj[0],
                                title: obj[1]
                            });
                        }
                    }

                    // Check for Text Content
                    if (obj.length > 0) {
                        obj.forEach(item => {
                            if (typeof item === 'string') {
                                // Heuristic: Capture reasonable length strings 
                                if (item.length > 10 && !item.match(/^[a-f0-9-]{36}$/) && !item.startsWith("http")) {
                                    // Avoid duplicates
                                    if (!content.text_blocks.includes(item)) {
                                        content.text_blocks.push(item);
                                    }
                                }
                            } else if (Array.isArray(item)) {
                                // Specific text segment structure: [["Text"]] is common in some encodings
                                if (item.length === 1 && typeof item[0] === 'string' && item[0].length > 1) {
                                    if (!content.text_blocks.includes(item[0])) {
                                        content.text_blocks.push(item[0]);
                                    }
                                } else {
                                    processNode(item);
                                }
                            } else {
                                processNode(item);
                            }
                        });
                    }
                } else {
                    Object.values(obj).forEach(processNode);
                }
            }
            processNode(response);
        } catch (e) {
            console.error("Error parsing getNotebookContent response:", e);
        }

        // Clean up text blocks to form a coherent summary
        return {
            ...content,
            full_text: content.text_blocks.join("\n\n")
        };
    }
    findUuid(obj) {
        // ... existing findUuid ...
        if (typeof obj === 'string') {
            if (obj.length === 36 && (obj.match(/-/g) || []).length === 4) return obj;
            if (obj.startsWith('[') || obj.startsWith('{')) {
                try { return this.findUuid(JSON.parse(obj)); } catch (e) { }
            }
        }
        if (Array.isArray(obj)) {
            for (const item of obj) {
                const res = this.findUuid(item);
                if (res) return res;
            }
        }
        if (typeof obj === 'object' && obj !== null) {
            for (const val of Object.values(obj)) {
                const res = this.findUuid(val);
                if (res) return res;
            }
        }
        return null;
    }

    async createNotebook(title) {
        // ... existing
        // RPC: CCqFvf
        const payload = [title, null, null, [2], [1, null, null, null, null, null, null, null, null, null, [1]]];
        const resp = await this.executeRpc("CCqFvf", payload);

        let notebookId = null;
        if (Array.isArray(resp) && resp.length > 2) notebookId = resp[2];
        if (!notebookId) notebookId = this.findUuid(resp);

        if (!notebookId) throw new Error("Failed to create notebook");
        return notebookId;
    }

    async addSource(notebookId, url) {
        // RPC: izAoDd
        const sourcePayload = [null, null, null, null, null, null, null, [url], null, null, 1];
        const payload = [[sourcePayload], notebookId, [2], [1, null, null, null, null, null, null, null, null, null, [1]]];

        const resp = await this.executeRpc("izAoDd", payload);

        // Extract Source ID
        let sourceId = this.findUuid(resp);

        if (!sourceId) {
            // Poll for async source (YouTube)
            // Simplified: Wait 5s and check notebook sources
            await new Promise(r => setTimeout(r, 4000));
            const sources = await this.getSources(notebookId);
            if (sources.length > 0) sourceId = sources[0];
        }

        if (!sourceId) throw new Error("Failed to add source");

        return { source_id: sourceId };
    }

    async getSources(notebookId) {
        // RPC: gArtLc
        const payload = [[2], notebookId, null];
        const resp = await this.executeRpc("gArtLc", payload);

        const ids = [];
        const recurse = (obj) => {
            if (typeof obj === 'string' && obj.length === 36 && (obj.match(/-/g) || []).length === 4) ids.push(obj);
            else if (Array.isArray(obj)) obj.forEach(recurse);
        };
        recurse(resp);
        return ids;
    }

    async runInfographicTool(notebookId, sourceIds) {
        // RPC: R7cb6c
        // 7 = Infographic
        // Payload struct: [2], nbId, [ ... ]

        let sourceParam;
        if (Array.isArray(sourceIds)) {
            // Structure for multiple sources: List of [sourceId] lists
            // e.g. [ [ [id1], [id2] ] ]
            sourceParam = [sourceIds.map(id => [id])];
        } else {
            // Single source
            sourceParam = [[[sourceIds]]];
        }

        const toolPayload = [null, null, 7, sourceParam, null, null, null, null, null, null, null, null, null, null, [[null, null, null, 1, 2]]];
        const payload = [[2], notebookId, toolPayload];

        console.log("Running Tool with Payload structure for sources:", JSON.stringify(sourceParam));

        const resp = await this.executeRpc("R7cb6c", payload);

        if (Array.isArray(resp) && resp.length > 0 && Array.isArray(resp[0])) {
            return resp[0][0]; // Operation ID
        }
        return null; // Might be silent success or failure
    }

    async waitForInfographic(notebookId, opId) {
        console.log(`Waiting for infographic (Op ID: ${opId})...`);
        for (let i = 0; i < 90; i++) { // 90 * 2 = 180 seconds (3 mins)
            await new Promise(r => setTimeout(r, 2000));

            // Check artifacts via gArtLc
            const payload = [[2], notebookId, null];
            const resp = await this.executeRpc("gArtLc", payload);

            // Debug Log every 5th attempt
            if (i % 5 === 0) console.log(`Polling attempt ${i + 1}/90...`);

            let foundUrl = null;

            const scanForInfographic = (arr) => {
                if (!Array.isArray(arr)) return;
                // Heuristic: Type 7 check
                if (arr.length > 2 && arr[2] === 7) {
                    try {
                        const content = arr[14];
                        const items = content[2];
                        const url = items[0][1][0];
                        if (url && url.startsWith("http")) foundUrl = url;
                    } catch (e) { }
                }
                arr.forEach(scanForInfographic);
            };

            scanForInfographic(resp);

            if (foundUrl) {
                console.log("Infographic found:", foundUrl);
                return foundUrl;
            }
        }
        throw new Error("Timed out waiting for infographic (3 mins exceeded)");
    }
}


// --- UTILS ---

function extractVideoId(url) {
    try {
        const u = new URL(url);
        if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
        if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    } catch (e) { }
    return null;
}

async function broadcastStatus(url, status, payload = {}) {
    try {
        const videoId = extractVideoId(url);
        const allTabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
        for (const tab of allTabs) {
            chrome.tabs.sendMessage(tab.id, {
                type: (status === "AUTH_EXPIRED" || status === "QUEUE_UPDATE") ? status : "INFOGRAPHIC_UPDATE",
                videoId: videoId,
                status: status,
                ...payload
            }).catch(() => { });
        }
    } catch (e) { }
}

async function updateState(videoId, newState) {
    if (!videoId) return;
    const result = await chrome.storage.local.get(['infographicStates']);
    const states = result.infographicStates || {};
    // Merge existing state with new state to preserve fields like title
    states[videoId] = { ...(states[videoId] || {}), ...newState };
    await chrome.storage.local.set({ infographicStates: states });
}
