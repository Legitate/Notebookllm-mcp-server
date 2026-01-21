// content.js

const UI_CONTAINER_ID = 'altrosyn-infographic-panel';

// Helper to extract video ID
function extractVideoId(url) {
    try {
        const u = new URL(url);
        if (u.hostname.includes('youtube.com')) {
            return u.searchParams.get('v');
        } else if (u.hostname.includes('youtu.be')) {
            return u.pathname.slice(1);
        }
    } catch (e) { }
    return null;
}

// run immediately
detectAndSendUrl();

// Also listen for URL changes (SPA navigation on YouTube often doesn't reload the page)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        detectAndSendUrl();
    }
}).observe(document, { subtree: true, childList: true });

function detectAndSendUrl() {
    const url = window.location.href;
    // Always check state to ensure Auth UI shows up if needed
    checkAuthState();

    if (isYouTubeVideo(url)) {
        console.log('YouTube video detected:', url);
        chrome.runtime.sendMessage({ type: 'YOUTUBE_ACTIVE', url: url });
    }
}

function isYouTubeVideo(url) {
    return (url.includes('youtube.com/watch') || url.includes('youtu.be/')) && extractVideoId(url) !== null;
}

function isHomeOrUnsupported(url) {
    return !isYouTubeVideo(url);
}

function checkAuthState() {
    // Auth is handled automatically. 
    // We just check if state reports AUTH_REQUIRED failure.
    restoreStateForCurrentVideo();
}

// --- UI INJECTION & LINK IMPLEMENTATION ---

// --- UI INJECTION & LINK IMPLEMENTATION ---

function injectStyles() {
    if (document.getElementById('altrosyn-styles')) return;
    const style = document.createElement('style');
    style.id = 'altrosyn-styles';
    style.textContent = `
        #${UI_CONTAINER_ID} {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 340px;
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12), 0 1px 1px rgba(0,0,0,0.05);
            border-radius: 24px;
            padding: 24px;
            z-index: 2147483647;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            display: none;
            flex-direction: column;
            gap: 18px;
            border: 1px solid rgba(255, 255, 255, 0.8);
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            color: #1f2937;
        }
        #${UI_CONTAINER_ID}.minimized {
            width: 56px;
            height: 56px;
            padding: 0;
            border-radius: 28px;
            cursor: pointer;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.9);
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            justify-content: center;
            align-items: center;
            border: 1px solid rgba(255,255,255,0.8);
        }
        #${UI_CONTAINER_ID}.minimized:hover {
            transform: scale(1.08);
            box-shadow: 0 12px 32px rgba(37, 99, 235, 0.25);
        }
        #${UI_CONTAINER_ID} * {
            box-sizing: border-box;
        }
        /* Header */
        .altrosyn-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 4px;
        }
        .altrosyn-title {
            font-size: 17px;
            font-weight: 700;
            color: #111827;
            display: flex;
            align-items: center;
            gap: 10px;
            letter-spacing: -0.01em;
        }
        .altrosyn-title svg {
            width: 22px;
            height: 22px;
            color: #2563eb;
            filter: drop-shadow(0 2px 4px rgba(37,99,235,0.2));
        }
        .altrosyn-min-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 6px;
            color: #9ca3af;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        .altrosyn-min-btn:hover {
            background: rgba(0,0,0,0.04);
            color: #4b5563;
        }
        
        /* Buttons */
        .altrosyn-btn {
            width: 100%;
            padding: 12px 18px;
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            color: white;
            border: none;
            border-radius: 16px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 0.3px;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
        }
        .altrosyn-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(37, 99, 235, 0.4);
            filter: brightness(1.05);
        }
        .altrosyn-btn:active {
            transform: scale(0.98);
        }
        .altrosyn-btn:disabled {
            background: #e5e7eb;
            color: #9ca3af;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        .altrosyn-btn-secondary {
            background: rgba(255, 255, 255, 0.6);
            color: #2563eb;
            border: 1px solid rgba(37, 99, 235, 0.2);
            box-shadow: 0 2px 8px rgba(0,0,0,0.03);
        }
        .altrosyn-btn-secondary:hover {
            background: rgba(255, 255, 255, 0.9);
            border-color: rgba(37, 99, 235, 0.4);
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
        }

        /* Status & Content */
        .altrosyn-status {
            font-size: 14px;
            text-align: center;
            color: #6b7280;
            margin: 2px 0;
            font-weight: 500;
        }
        .altrosyn-img-preview {
            width: 100%;
            height: auto;
            border-radius: 12px;
            border: 1px solid rgba(0,0,0,0.04);
            cursor: pointer;
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            display: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }
        .altrosyn-img-preview:hover {
            transform: scale(1.03) rotate(0.5deg);
            box-shadow: 0 12px 32px rgba(0,0,0,0.15);
        }
        .altrosyn-link {
            display: block;
            text-align: center;
            color: #2563eb;
            text-decoration: none;
            padding: 10px;
            font-size: 13px;
            font-weight: 600;
            border-radius: 12px;
            transition: background 0.2s;
        }
        .altrosyn-link:hover {
            background: rgba(37, 99, 235, 0.08);
        }

        /* Queue UI */
        .altrosyn-queue-container {
            border-top: 1px solid rgba(0,0,0,0.06);
            padding-top: 16px;
            margin-top: 8px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .altrosyn-queue-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
            font-weight: 600;
            color: #374151;
            cursor: pointer;
            user-select: none;
        }
        .altrosyn-queue-header:hover {
            color: #111827;
        }
        .altrosyn-queue-count {
            background: #eff6ff;
            color: #2563eb;
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 700;
        }
        .altrosyn-queue-list {
            display: none; /* Toggled */
            flex-direction: column;
            gap: 6px;
            max-height: 160px;
            overflow-y: auto;
            margin: 4px 0;
            padding-right: 4px;
        }
        /* Custom Scrollbar */
        .altrosyn-queue-list::-webkit-scrollbar {
            width: 4px;
        }
        .altrosyn-queue-list::-webkit-scrollbar-track {
            background: transparent;
        }
        .altrosyn-queue-list::-webkit-scrollbar-thumb {
            background: #d1d5db;
            border-radius: 4px;
        }
        
        .altrosyn-queue-list.expanded {
            display: flex;
        }
        .altrosyn-queue-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            padding: 8px 10px;
            background: rgba(255, 255, 255, 0.6);
            border: 1px solid rgba(0,0,0,0.04);
            border-radius: 8px;
            color: #4b5563;
        }
        .altrosyn-queue-item span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex: 1;
        }
        .altrosyn-queue-remove {
            color: #ef4444;
            cursor: pointer;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 4px;
            margin-left: 6px;
        }
        .altrosyn-queue-remove:hover {
            background: rgba(239, 68, 68, 0.1);
        }
        .altrosyn-queue-controls {
            display: flex;
            gap: 10px;
        }
        .minimized-icon {
            display: none;
            width: 28px;
            height: 28px;
            color: #2563eb;
            filter: drop-shadow(0 2px 4px rgba(37,99,235,0.25));
        }
        #${UI_CONTAINER_ID}.minimized .minimized-icon {
            display: block;
        }
        #${UI_CONTAINER_ID}.minimized > *:not(.minimized-icon) {
            display: none !important;
        }
    `;
    document.head.appendChild(style);
}

function getOrCreateUI() {
    injectStyles();
    let container = document.getElementById(UI_CONTAINER_ID);

    if (!container) {
        container = document.createElement('div');
        container.id = UI_CONTAINER_ID;
        document.body.appendChild(container);

        // --- Structure ---

        // Minimized Icon (Visible only when minimized)
        const minIcon = document.createElement('div');
        minIcon.className = 'minimized-icon';
        minIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 12 2.1 11.9"></path><path d="M12 12V2.1"></path></svg>`; // Pie Chart-ish icon
        container.appendChild(minIcon);

        // Restore from minimized click
        container.onclick = (e) => {
            if (container.classList.contains('minimized')) {
                container.classList.remove('minimized');
                chrome.storage.local.set({ minimized: false });
                e.stopPropagation();
            }
        };

        // Header
        const header = document.createElement('div');
        header.className = 'altrosyn-header';
        header.innerHTML = `
            <div class="altrosyn-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                Notebook Gen
            </div>
            <button class="altrosyn-min-btn" title="Minimize">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
        `;
        container.appendChild(header);

        // Minimize Handler
        header.querySelector('.altrosyn-min-btn').onclick = (e) => {
            e.stopPropagation();
            container.classList.add('minimized');
            chrome.storage.local.set({ minimized: true });
        };

        // Status
        const statusEl = document.createElement('div');
        statusEl.id = UI_CONTAINER_ID + '-status';
        statusEl.className = 'altrosyn-status';
        container.appendChild(statusEl);

        // Auth Container
        const authContainer = document.createElement('div');
        authContainer.id = UI_CONTAINER_ID + '-auth-container';
        authContainer.style.display = 'none';
        authContainer.style.flexDirection = 'column';
        authContainer.style.gap = '12px';
        container.appendChild(authContainer);

        const loginMsg = document.createElement('div');
        loginMsg.id = UI_CONTAINER_ID + '-auth-msg';
        loginMsg.className = 'altrosyn-status';
        loginMsg.style.color = '#d93025';
        loginMsg.textContent = "Please log in to NotebookLM in a new tab.";
        authContainer.appendChild(loginMsg);

        const loginBtn = document.createElement('a');
        loginBtn.className = 'altrosyn-btn';
        loginBtn.textContent = 'Open NotebookLM';
        loginBtn.href = 'https://notebooklm.google.com';
        loginBtn.target = '_blank';
        authContainer.appendChild(loginBtn);

        // Main Interaction Container (Generate, Preview)
        const interactionContainer = document.createElement('div');
        interactionContainer.id = UI_CONTAINER_ID + '-interaction-container';
        interactionContainer.style.display = 'flex';
        interactionContainer.style.flexDirection = 'column';
        interactionContainer.style.gap = '12px';
        container.appendChild(interactionContainer);

        // Generate Button
        const generateBtn = document.createElement('button');
        generateBtn.id = UI_CONTAINER_ID + '-generate-btn';
        generateBtn.className = 'altrosyn-btn';
        generateBtn.textContent = 'Generate Infographic';
        generateBtn.onclick = startGeneration;
        interactionContainer.appendChild(generateBtn);

        // Add To Queue Button
        const addToQueueBtn = document.createElement('button');
        addToQueueBtn.id = UI_CONTAINER_ID + '-queue-add-btn';
        addToQueueBtn.className = 'altrosyn-btn altrosyn-btn-secondary';
        addToQueueBtn.textContent = 'Add to Queue';
        addToQueueBtn.onclick = handleAddToQueue;
        interactionContainer.appendChild(addToQueueBtn);

        // Queue Container
        const queueContainer = document.createElement('div');
        queueContainer.className = 'altrosyn-queue-container';
        queueContainer.id = UI_CONTAINER_ID + '-queue-section';
        queueContainer.style.display = 'none'; // Hidden if empty initially? 

        // Queue Header (Toggle)
        const queueHeader = document.createElement('div');
        queueHeader.className = 'altrosyn-queue-header';
        queueHeader.innerHTML = `<span>Queue</span><span id="${UI_CONTAINER_ID}-queue-count" class="altrosyn-queue-count">0</span>`;
        queueHeader.onclick = toggleQueueList;
        queueContainer.appendChild(queueHeader);

        // Queue List
        const queueList = document.createElement('div');
        queueList.id = UI_CONTAINER_ID + '-queue-list';
        queueList.className = 'altrosyn-queue-list';
        queueContainer.appendChild(queueList);

        // Queue Controls (Generate All, Clear)
        const queueControls = document.createElement('div');
        queueControls.className = 'altrosyn-queue-controls';

        const genQueueBtn = document.createElement('button');
        genQueueBtn.id = UI_CONTAINER_ID + '-queue-gen-btn';
        genQueueBtn.className = 'altrosyn-btn';
        genQueueBtn.textContent = 'Generate All';
        genQueueBtn.style.fontSize = '12px';
        genQueueBtn.onclick = startQueueGeneration;

        const clearQueueBtn = document.createElement('button');
        clearQueueBtn.className = 'altrosyn-btn altrosyn-btn-secondary';
        clearQueueBtn.textContent = 'Clear';
        clearQueueBtn.style.fontSize = '12px';
        clearQueueBtn.style.width = 'auto';
        clearQueueBtn.onclick = clearQueue;

        queueControls.appendChild(genQueueBtn);
        queueControls.appendChild(clearQueueBtn);
        queueContainer.appendChild(queueControls);

        interactionContainer.appendChild(queueContainer);

        const img = document.createElement('img');
        img.id = UI_CONTAINER_ID + '-img-preview';
        img.className = 'altrosyn-img-preview';
        interactionContainer.appendChild(img);

        // Link
        const link = document.createElement('a');
        link.id = UI_CONTAINER_ID + '-link';
        link.className = 'altrosyn-link';
        link.textContent = 'Open Full Size';
        link.target = '_blank';
        link.style.display = 'none';
        interactionContainer.appendChild(link);
        // Restore minimized state
        chrome.storage.local.get(['minimized'], (result) => {
            if (result.minimized) {
                container.classList.add('minimized');
            }
        });
    }
    return container;
}

function updateUI(status, imageUrl = null, errorMessage = null, title = null) {
    const container = getOrCreateUI();
    const statusEl = document.getElementById(UI_CONTAINER_ID + '-status');
    const authContainer = document.getElementById(UI_CONTAINER_ID + '-auth-container');
    const interactionContainer = document.getElementById(UI_CONTAINER_ID + '-interaction-container');
    const generateBtn = document.getElementById(UI_CONTAINER_ID + '-generate-btn');
    const imgPreview = document.getElementById(UI_CONTAINER_ID + '-img-preview');
    const link = document.getElementById(UI_CONTAINER_ID + '-link');

    const authMsg = document.getElementById(UI_CONTAINER_ID + '-auth-msg');

    // Default container display
    container.style.display = 'flex';

    if (status === 'AUTH_REQUIRED') {
        statusEl.textContent = 'Login Required';
        authMsg.textContent = "Please log in to NotebookLM in a new tab.";
        authContainer.style.display = 'flex';
    } else if (status === 'LIMIT_EXCEEDED') {
        statusEl.textContent = 'Limit Reached';
        authMsg.textContent = errorMessage || "Your daily limit is over. Try again after 24 hrs.";
        authContainer.style.display = 'flex';

        // Custom "Go Home" button for this state
        const loginBtn = authContainer.querySelector('.altrosyn-btn');
        loginBtn.textContent = 'Go Home';
        loginBtn.href = "#";
        loginBtn.removeAttribute('target');
        loginBtn.onclick = (e) => {
            e.preventDefault();
            resetToInitialState();
        };
    } else {
        authContainer.style.display = 'none';
    }

    // Always show interactions (unless minimized/hidden globally)
    if (status === 'LIMIT_EXCEEDED') {
        interactionContainer.style.display = 'none';
    } else {
        interactionContainer.style.display = 'flex';
    }

    // Status Text
    if (status === 'RUNNING') {
        statusEl.textContent = 'Generating...';
        statusEl.style.color = '#5f6368';
    } else if (status === 'COMPLETED') {
        statusEl.textContent = 'Done!';
        statusEl.style.color = '#137333';
    } else if (status === 'FAILED') {
        statusEl.textContent = errorMessage || 'Failed';
        statusEl.style.color = '#d93025';
    } else if (status === 'INVALID_CONTEXT') {
        statusEl.textContent = errorMessage || 'Open Video';
        statusEl.style.color = '#5f6368';
    } else {
        statusEl.textContent = 'Ready';
        statusEl.style.color = '#5f6368';
    }

    // Button State
    const currentVideoId = extractVideoId(window.location.href);

    if (status === 'RUNNING') {
        generateBtn.textContent = 'Creating Magic...';
        generateBtn.disabled = true;
    } else if (status === 'COMPLETED') {
        if (!currentVideoId) {
            // On Home Page, showing persistent result
            generateBtn.textContent = 'Open Video to Generate New';
            generateBtn.className = 'altrosyn-btn altrosyn-btn-secondary';
            generateBtn.disabled = true;
        } else {
            // On a Video Page
            generateBtn.textContent = 'Generate New';
            generateBtn.className = 'altrosyn-btn altrosyn-btn-secondary';
            generateBtn.disabled = false;
            generateBtn.onclick = resetToInitialState;
        }
    } else if (status === 'INVALID_CONTEXT') {
        generateBtn.textContent = 'Open a Video First';
        generateBtn.className = 'altrosyn-btn';
        generateBtn.disabled = true;
    } else if (status === 'AUTH_REQUIRED') {
        generateBtn.textContent = 'Retry Generation';
        generateBtn.className = 'altrosyn-btn';
        generateBtn.disabled = false;
        generateBtn.onclick = startGeneration;
    } else {
        generateBtn.textContent = 'Generate Infographic';
        generateBtn.className = 'altrosyn-btn';
        generateBtn.disabled = false;
        generateBtn.className = 'altrosyn-btn';
        generateBtn.disabled = false;
        generateBtn.onclick = startGeneration;
    }

    // Update Queue UI
    // Update Queue UI
    updateQueueUI(status);

    // Shared Download Logic
    const triggerDownload = (e) => {
        e.preventDefault();
        let filename = "infographic.png";
        if (title) {
            const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            filename = `${safeTitle}.png`;
        } else {
            // Try fallback to page title if not in state
            const pageTitle = document.title.replace(' - YouTube', '');
            const safeTitle = pageTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            filename = `${safeTitle}.png`;
        }

        chrome.runtime.sendMessage({
            type: 'DOWNLOAD_IMAGE',
            url: imageUrl,
            filename: filename
        });
    };

    if (status === 'COMPLETED' && imageUrl) {
        imgPreview.src = imageUrl;
        imgPreview.style.display = 'block';
        imgPreview.onclick = triggerDownload; // Now triggers specific filename download

        link.href = imageUrl; // fallback
        link.textContent = "Download Image";
        link.style.display = 'block';
        link.onclick = triggerDownload;
    } else {
        imgPreview.style.display = 'none';
        link.style.display = 'none';
    }
}

// Scoped State Restoration with Global Persistence
function restoreStateForCurrentVideo() {
    chrome.storage.local.get(['infographicStates', 'lastActiveVideoId'], (result) => {
        const states = result.infographicStates || {};
        const lastId = result.lastActiveVideoId;
        const currentId = extractVideoId(window.location.href);

        let targetId = null;

        // 1. Check Local Context First (User is ON a video page)
        if (currentId && states[currentId]) {
            const localState = states[currentId];
            // If this video has data, it takes precedence.
            if (['RUNNING', 'COMPLETED', 'FAILED', 'AUTH_PENDING', 'LIMIT_EXCEEDED'].includes(localState.status)) {
                targetId = currentId;
                // Self-Heal: If we are viewing a completed video, make it the global active one
                // so it persists if we go Home.
                if (lastId !== currentId) {
                    chrome.storage.local.set({ lastActiveVideoId: currentId });
                }
            }
        }

        // 2. If no local state (or we are on Home), check Global Sticky
        if (!targetId && lastId && states[lastId]) {
            const globalState = states[lastId];
            if (['RUNNING', 'COMPLETED', 'FAILED', 'AUTH_PENDING', 'LIMIT_EXCEEDED'].includes(globalState.status)) {
                targetId = lastId;
            }
        }

        if (targetId) {
            // We have a sticky state
            const state = states[targetId];

            // 3. Stale State Cleanup (Safety Check)
            // If it's been RUNNING for > 5 minutes, it's likely dead.
            const STALE_TIMEOUT = 5 * 60 * 1000; // 5 mins
            if (state.status === 'RUNNING' && state.operation_id && (Date.now() - state.operation_id > STALE_TIMEOUT)) {
                console.warn(`Detected stale RUNNING state for ${targetId} (Age: ${Date.now() - state.operation_id}ms). Resetting.`);
                // Auto-fail it to unlock UI
                const cleanedState = { ...state, status: 'FAILED', error: 'Operation timed out (stale)' };
                // Update local storage effectively "healing" the state
                states[targetId] = cleanedState;
                chrome.storage.local.set({ infographicStates: states });

                // Show the failed state
                updateUI('FAILED', null, 'Operation timed out (stale)');
                return;
            }

            if (state.status === 'AUTH_PENDING') {
                // No auto-retry here for now - user needs to login elsewhere.
                // Ideally we could detect login success but that's complex for now.
                return;
            }

            updateUI(state.status, state.image_url, state.error, state.title);
        } else {
            // No sticky state, fall back to current context
            if (currentId) {
                // We are on a video, and no global job is active. IDLE.
                updateUI('IDLE');
            } else {
                // On Home, no global job.
                updateUI('INVALID_CONTEXT', null, "Open a video to generate");
            }
        }
    });
}

// Listen for status updates
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'INFOGRAPHIC_UPDATE') {
        // Always attempt to restore state. 
        // restoreStateForCurrentVideo determines if this update is relevant 
        // (matches current video OR matches global sticky video).
        restoreStateForCurrentVideo();
    } else if (message.type === 'AUTH_EXPIRED') {
        updateUI('AUTH_REQUIRED');
    } else if (message.type === 'LIMIT_EXCEEDED') {
        updateUI('LIMIT_EXCEEDED');
    }
});

function startGeneration() {
    const url = window.location.href;
    const title = document.title.replace(' - YouTube', '');
    updateUI('RUNNING');
    chrome.runtime.sendMessage({ type: 'GENERATE_INFOGRAPHIC', url: url, title: title });
}

// --- QUEUE LOGIC ---

function updateQueueUI(currentStatus = 'IDLE') {
    chrome.storage.local.get(['infographicQueue'], (result) => {
        const queue = result.infographicQueue || [];
        const countEl = document.getElementById(UI_CONTAINER_ID + '-queue-count');
        const listEl = document.getElementById(UI_CONTAINER_ID + '-queue-list');
        const sectionEl = document.getElementById(UI_CONTAINER_ID + '-queue-section');
        const addBtn = document.getElementById(UI_CONTAINER_ID + '-queue-add-btn');
        const genBtn = document.getElementById(UI_CONTAINER_ID + '-queue-gen-btn');

        if (countEl) countEl.textContent = queue.length;

        // Show/Hide Queue Section based on content? 
        // Let's always show it if there's something, or maybe always show it to discover feature?
        // Decided: always show it to let user know it exists.
        if (sectionEl) sectionEl.style.display = 'flex';

        // Check if current video is in queue
        const currentId = extractVideoId(window.location.href);

        // Helper to disable buttons
        const isRunning = (currentStatus === 'RUNNING');

        if (addBtn) {
            if (isRunning) {
                addBtn.disabled = true;
                addBtn.textContent = 'Queue Locked';
            } else if (!currentId) {
                addBtn.disabled = true;
                addBtn.textContent = 'Open Video to Add';
            } else if (queue.some(item => item.videoId === currentId)) {
                addBtn.disabled = true;
                addBtn.textContent = 'Added to Queue';
            } else {
                addBtn.disabled = false;
                addBtn.textContent = 'Add to Queue';
            }
        }

        // Render List
        if (listEl) {
            listEl.innerHTML = '';
            if (queue.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.textContent = 'Queue is empty';
                emptyMsg.style.fontSize = '12px';
                emptyMsg.style.color = '#9aa0a6';
                emptyMsg.style.textAlign = 'center';
                emptyMsg.style.padding = '8px';
                listEl.appendChild(emptyMsg);
                if (genBtn) genBtn.disabled = true;
            } else {
                // Generate Button Logic
                if (genBtn) {
                    if (isRunning) {
                        genBtn.disabled = true;
                        genBtn.textContent = 'Processing...';
                    } else {
                        genBtn.disabled = false;
                        genBtn.textContent = 'Generate All';
                    }
                }

                queue.forEach((item, index) => {
                    const row = document.createElement('div');
                    row.className = 'altrosyn-queue-item';
                    row.innerHTML = `<span>${item.title}</span>`;

                    const removeBtn = document.createElement('div');
                    removeBtn.className = 'altrosyn-queue-remove';
                    removeBtn.textContent = '×';
                    // Disable remove if running? Maybe safer.
                    if (isRunning) {
                        removeBtn.style.pointerEvents = 'none';
                        removeBtn.style.opacity = '0.5';
                    } else {
                        removeBtn.onclick = (e) => {
                            e.stopPropagation();
                            removeFromQueue(index);
                        };
                    }
                    row.appendChild(removeBtn);
                    listEl.appendChild(row);
                });
            }
        }
    });
}

function handleAddToQueue() {
    const url = window.location.href;
    const videoId = extractVideoId(url);
    const title = document.title.replace(' - YouTube', '');

    if (!videoId) return;

    chrome.storage.local.get(['infographicQueue'], (result) => {
        const queue = result.infographicQueue || [];
        if (!queue.some(item => item.videoId === videoId)) {
            queue.push({ videoId, url, title });
            chrome.storage.local.set({ infographicQueue: queue }, () => {
                // If we are adding, we must be in a state where we CAN add, so likely IDLE or at least not RUNNING queue
                // But let's check current UI state/storage if we wanted to be 100% pure, but IDLE is safe default for "enable buttons"
                // Actually, best to just call it without args to default to IDLE which is "Interactive"
                updateQueueUI('IDLE');
            });
        }
    });
}

function removeFromQueue(index) {
    chrome.storage.local.get(['infographicQueue'], (result) => {
        const queue = result.infographicQueue || [];
        queue.splice(index, 1);
        chrome.storage.local.set({ infographicQueue: queue }, () => {
            updateQueueUI('IDLE');
        });
    });
}

function clearQueue() {
    chrome.storage.local.set({ infographicQueue: [] }, () => {
        updateQueueUI('IDLE');
    });
}

function toggleQueueList() {
    const list = document.getElementById(UI_CONTAINER_ID + '-queue-list');
    if (list) list.classList.toggle('expanded');
}

function startQueueGeneration() {
    chrome.storage.local.get(['infographicQueue'], (result) => {
        const queue = result.infographicQueue || [];
        if (queue.length === 0) return;

        updateUI('RUNNING'); // Triggers updateQueueUI('RUNNING') disabling buttons
        const statusEl = document.getElementById(UI_CONTAINER_ID + '-status');
        if (statusEl) statusEl.textContent = `Processing ${queue.length} videos...`;

        chrome.runtime.sendMessage({ type: 'GENERATE_QUEUE_INFOGRAPHIC', queue: queue });
    });
}


function resetToInitialState() {
    const currentVideoId = extractVideoId(window.location.href);
    if (!currentVideoId) return;

    // Clear state for this video AND claim focus to break any sticky state from other videos
    chrome.storage.local.get(['infographicStates'], (result) => {
        const states = result.infographicStates || {};

        // Remove existing state for this video
        if (states[currentVideoId]) {
            delete states[currentVideoId];
        }

        // Update storage: 
        // 1. Save cleaned states
        // 2. Set lastActiveVideoId to current, ensuring we look at THIS video (which is now empty/IDLE)
        chrome.storage.local.set({
            infographicStates: states,
            lastActiveVideoId: currentVideoId
        }, () => {
            restoreStateForCurrentVideo(); // Should now resolve to IDLE
        });
    });
}
