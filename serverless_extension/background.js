// background.js (Serverless)

const NOTEBOOKLM_BASE = "https://notebooklm.google.com";
let currentYouTubeUrl = null;

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
        runQueueGenerationFlow(message.queue)
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

// --- CORE FLOW ---

async function runGenerationFlow(url, title) {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    await updateState(videoId, { status: 'RUNNING', operation_id: Date.now(), title: title });
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
        const errMsg = e.message || "Unknown error";

        // Handle Auth Error specifically?
        // With auto-auth, 401 means "Not Logged In to Google".
        if (errMsg.includes("401") || errMsg.includes("Authentication failed")) {
            await updateState(videoId, { status: 'AUTH_REQUIRED', error: "Please log in to NotebookLM in a new tab." });
            broadcastStatus(url, "AUTH_EXPIRED"); // Reuse existing signal for "Need Login"
        } else {
            await updateState(videoId, { status: 'FAILED', error: errMsg });
            broadcastStatus(url, "FAILED", { error: errMsg });
        }
        throw e;
    }
}


async function runQueueGenerationFlow(queue) {
    if (!queue || queue.length === 0) return;

    // Use the first video ID as the "primary" key for state updates to keep UI in sync?
    // Or maybe we don't update individual video states, but just broadcast global status?
    // Let's use the first video's ID for state tracking for now, or maybe a special "QUEUE" ID?
    // Since UI listens to restoration, let's update ALL queued items to RUNNING state so if user navigates to them, they see it?

    const primaryVideoId = queue[0].videoId;
    const title = `Queue Batch (${queue.length} videos)`;

    // 1. Set State for all items AND set Global Active ID to lock UI
    await chrome.storage.local.set({ lastActiveVideoId: primaryVideoId });

    for (const item of queue) {
        await updateState(item.videoId, { status: 'RUNNING', operation_id: Date.now(), title: item.title });
        // We can't easily broadcast to specific tabs unless we track them, but broadcastStatus does wildcards.
    }
    broadcastStatus(null, "RUNNING"); // Broadcast globally

    try {
        const client = new NotebookLMClient();
        await client.init();

        console.log("Creating Notebook for Queue...");
        const notebookId = await client.createNotebook("Infographic Queue Batch");
        console.log("Notebook ID:", notebookId);

        // 3. Add Sources Sequentially
        let lastSourceId = null;
        for (let i = 0; i < queue.length; i++) {
            const item = queue[i];
            console.log(`Adding source ${i + 1}/${queue.length}: ${item.url}`);

            // Broadcast progress?
            // updateState(primaryVideoId, { status: 'RUNNING', message: `Adding source ${i+1}/${queue.length}` });

            const sourceData = await client.addSource(notebookId, item.url);
            lastSourceId = sourceData.source_id;

            // Brief pause between adds to be safe
            await new Promise(r => setTimeout(r, 2000));
        }

        // Wait for ingestion
        await new Promise(r => setTimeout(r, 5000));

        // 4. Run Infographic Tool (Using the last source ID is usually fine, or maybe we don't strictly need it if context is whole notebook)
        // NotebookLM tools usually work on "selected sources". Does API auto-select all? 
        // Usually creating a new notebook enables all current sources.

        console.log("Running Infographic Tool on Batch...");
        const opId = await client.runInfographicTool(notebookId, lastSourceId);

        if (!opId) {
            throw new Error("Daily limit exceeded or tool failed");
        }

        console.log("Polling for result...");
        const imageUrl = await client.waitForInfographic(notebookId, opId);
        console.log("Success! Image:", imageUrl);

        // Update ALL queued items to COMPLETED
        for (const item of queue) {
            await updateState(item.videoId, { status: 'COMPLETED', image_url: imageUrl, title: item.title });
        }
        broadcastStatus(null, "COMPLETED", { image_url: imageUrl });

        // Also clear queue? Maybe content.js should handle that upon receiving COMPLETED?
        // Let's leave it to user to clear or content script to auto-clear.

        return { success: true, imageUrl: imageUrl };

    } catch (e) {
        console.error("Queue Generation Failed:", e);
        const errMsg = e.message || "Unknown error";
        for (const item of queue) {
            await updateState(item.videoId, { status: 'FAILED', error: errMsg });
        }
        broadcastStatus(null, "FAILED", { error: errMsg });
        throw e;
    }
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
            if (Array.isArray(chunk) && chunk.length > 2 && chunk[1] === rpcId) {
                const inner = chunk[2];
                if (inner) {
                    try {
                        return JSON.parse(inner);
                    } catch (e) {
                        return inner;
                    }
                }
            }
        }
        return [];
    }

    // ... existing findUuid ...
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

    async runInfographicTool(notebookId, sourceId) {
        // RPC: R7cb6c
        // 7 = Infographic
        // Payload struct: [2], nbId, [ ... ]
        // Using simplified sturdy payload from python client
        const sourceParam = [[[sourceId]]];
        const toolPayload = [null, null, 7, sourceParam, null, null, null, null, null, null, null, null, null, null, [[null, null, null, 1, 2]]];
        const payload = [[2], notebookId, toolPayload];

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
                type: status === "AUTH_EXPIRED" ? "AUTH_EXPIRED" : "INFOGRAPHIC_UPDATE",
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


