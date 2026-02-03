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

// --- KEEP ALIVE ---
let keepAlivePort;
function connectKeepAlive() {
    keepAlivePort = chrome.runtime.connect({ name: 'keepAlive' });
    keepAlivePort.onDisconnect.addListener(connectKeepAlive);

    // Heartbeat to keep service worker active
    setInterval(() => {
        if (keepAlivePort) {
            try {
                keepAlivePort.postMessage({ type: 'ping' });
            } catch (e) {
                // If port is detached, we'll reconnect via onDisconnect
            }
        }
    }, 5000); // 5 seconds (Aggressive Keep-Alive)
}
connectKeepAlive();

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
            /* Theme Variables - Default Light */
            --bg-panel: rgba(255, 255, 255, 0.85);
            --text-main: #1f2937;
            --text-header: #111827;
            --text-secondary: #6b7280;
            --border-panel: rgba(255, 255, 255, 0.8);
            --shadow-panel: rgba(0, 0, 0, 0.12);
            --icon-main: #2563eb;
            --btn-hover: rgba(0,0,0,0.04);
            --minimized-bg: rgba(255, 255, 255, 0.9);
            --minimized-shadow: rgba(0,0,0,0.15);
            --tooltip-bg: #333;
            --tooltip-text: #fff;
            --queue-item-bg: rgba(255, 255, 255, 0.6);
            --queue-item-text: #4b5563;
            --queue-remove: #ef4444;
            --btn-sec-bg: rgba(255, 255, 255, 0.6);
            --btn-sec-text: #2563eb;
            --btn-sec-border: rgba(37, 99, 235, 0.2);

            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 340px;
            background: var(--bg-panel);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            box-shadow: 0 12px 40px var(--shadow-panel), 0 1px 1px rgba(0,0,0,0.05);
            border-radius: 24px;
            padding: 24px;
            z-index: 2147483647;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            display: none;
            flex-direction: column;
            gap: 18px;
            border: 1px solid var(--border-panel);
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            color: var(--text-main);
        }
        
        #${UI_CONTAINER_ID}.dark-mode {
            --bg-panel: rgba(17, 24, 39, 0.95);
            --text-main: #f3f4f6;
            --text-header: #f9fafb;
            --text-secondary: #9ca3af;
            --border-panel: rgba(255, 255, 255, 0.1);
            --shadow-panel: rgba(0, 0, 0, 0.5);
            --icon-main: #60a5fa;
            --btn-hover: rgba(255,255,255,0.1);
            --minimized-bg: rgba(30, 41, 59, 0.95);
            --minimized-shadow: rgba(0,0,0,0.5);
            --tooltip-bg: #1e293b;
            --tooltip-text: #f8fafc;
            --queue-item-bg: rgba(31, 41, 55, 0.8);
            --queue-item-text: #d1d5db;
            --queue-remove: #f87171;
            --btn-sec-bg: rgba(255, 255, 255, 0.05);
            --btn-sec-text: #93c5fd;
            --btn-sec-border: rgba(255, 255, 255, 0.15);
        }

        #${UI_CONTAINER_ID}.minimized {
            width: 56px;
            height: 56px;
            padding: 0;
            border-radius: 28px;
            cursor: pointer;
            overflow: hidden;
            background: var(--minimized-bg);
            box-shadow: 0 8px 24px var(--minimized-shadow);
            justify-content: center;
            align-items: center;
            border: 1px solid var(--border-panel);
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
            color: var(--text-header);
            display: flex;
            align-items: center;
            gap: 10px;
            letter-spacing: -0.01em;
        }
        .altrosyn-title svg {
            width: 22px;
            height: 22px;
            color: var(--icon-main);
            filter: drop-shadow(0 2px 4px rgba(37,99,235,0.2));
        }
        .altrosyn-min-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 6px;
            color: var(--text-secondary);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        /* Removed extra brace here */
        .altrosyn-min-btn:hover {
            background: var(--btn-hover);
            color: var(--text-main);
        }

        /* Help Tooltip */
        .altrosyn-help-container {
            position: relative;
            display: inline-block;
        }
        .altrosyn-help-icon {
            cursor: pointer;
            color: var(--text-secondary);
            width: 18px;
            height: 18px;
            transition: color 0.2s;
        }
        .altrosyn-help-icon:hover {
            color: var(--icon-main);
        }
        .altrosyn-tooltip {
            visibility: hidden;
            width: 220px;
            background-color: var(--tooltip-bg);
            color: var(--tooltip-text);
            text-align: left;
            border-radius: 6px;
            padding: 10px;
            position: absolute;
            z-index: 1;
            bottom: 125%; /* Position above */
            right: 0; 
            margin-right: -10px;
            opacity: 0;
            transition: opacity 0.3s;
            font-size: 12px;
            font-weight: 400;
            line-height: 1.4;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            border: 1px solid var(--border-panel);
        }
        .altrosyn-tooltip::after {
            content: "";
            position: absolute;
            top: 100%;
            right: 14px;
            margin-left: -5px;
            border-width: 5px;
            border-style: solid;
            border-color: var(--tooltip-bg) transparent transparent transparent;
        }
        .altrosyn-help-container:hover .altrosyn-tooltip {
            visibility: visible;
            opacity: 1;
        }
        .altrosyn-tooltip ol {
            padding-left: 15px;
            margin: 5px 0 0 0;
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
        .dark-mode .altrosyn-btn:disabled {
            background: #374151;
            color: #6b7280;
        }

        .altrosyn-btn-secondary {
            background: var(--btn-sec-bg);
            color: var(--btn-sec-text);
            border: 1px solid var(--btn-sec-border);
            box-shadow: 0 2px 8px rgba(0,0,0,0.03);
        }
        .altrosyn-btn-secondary:hover {
            background: var(--bg-panel); /* slightly opaque */
            border-color: var(--icon-main);
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
        }

        /* Status & Content */
        .altrosyn-status {
            font-size: 14px;
            text-align: center;
            color: var(--text-secondary);
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
            color: var(--icon-main);
            text-decoration: none;
            padding: 10px;
            font-size: 13px;
            font-weight: 600;
            border-radius: 12px;
            transition: background 0.2s;
        }
        .altrosyn-link:hover {
            background: var(--btn-hover);
        }

        /* Queue UI */
        .altrosyn-queue-container {
            border-top: 1px solid var(--border-panel);
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
            color: var(--text-main);
            cursor: pointer;
            user-select: none;
        }
        .altrosyn-queue-header:hover {
            color: var(--text-header);
        }
        .altrosyn-queue-count {
            background: #eff6ff;
            color: #2563eb;
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 700;
        }
        .dark-mode .altrosyn-queue-count {
            background: #1e3a8a;
            color: #bfdbfe;
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
        .dark-mode .altrosyn-queue-list::-webkit-scrollbar-thumb {
            background: #4b5563;
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
            background: var(--queue-item-bg);
            border: 1px solid var(--border-panel);
            border-radius: 8px;
            color: var(--queue-item-text);
        }
        .altrosyn-queue-item span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex: 1;
        }
        .altrosyn-queue-remove {
            color: var(--queue-remove);
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
            color: var(--icon-main);
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
        <div style="display:flex; gap:8px; align-items:center;">
                <div class="altrosyn-help-container">
                     <svg xmlns="http://www.w3.org/2000/svg" class="altrosyn-help-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div class="altrosyn-tooltip">
                        <strong>How to use:</strong>
                        <ol>
                            <li>Open any YouTube video.</li>
                            <li>Click "Generate Infographic".</li>
                            <li>Wait for the magic (takes ~1 min).</li>
                        </ol>
                        <hr style="border:0; border-top:1px solid #555; margin:8px 0;">
                        <span style="opacity:0.8; font-size:11px;">Requires NotebookLM account.</span>
                    </div>
                </div>
                <button class="altrosyn-min-btn" id="${UI_CONTAINER_ID}-theme-toggle" title="Toggle Theme">
                   <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sun-icon"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                   <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="moon-icon" style="display:none;"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                </button>
                <button class="altrosyn-min-btn" id="${UI_CONTAINER_ID}-minimize-btn" title="Minimize">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
            </div>
        `;
        container.appendChild(header);

        // Theme Handler
        const themeBtn = header.querySelector(`#${UI_CONTAINER_ID}-theme-toggle`);
        const sunIcon = themeBtn.querySelector('.sun-icon');
        const moonIcon = themeBtn.querySelector('.moon-icon');

        function applyTheme(isDark) {
            if (isDark) {
                container.classList.add('dark-mode');
                sunIcon.style.display = 'none';
                moonIcon.style.display = 'block';
            } else {
                container.classList.remove('dark-mode');
                sunIcon.style.display = 'block';
                moonIcon.style.display = 'none';
            }
        }

        // Load saved theme
        chrome.storage.local.get(['theme'], (result) => {
            applyTheme(result.theme === 'dark');
        });

        themeBtn.onclick = (e) => {
            e.stopPropagation();
            const isDark = !container.classList.contains('dark-mode');
            applyTheme(isDark);
            chrome.storage.local.set({ theme: isDark ? 'dark' : 'light' });
        };

        // Minimize Handler
        const minimizeBtn = header.querySelector(`#${UI_CONTAINER_ID}-minimize-btn`);
        minimizeBtn.onclick = (e) => {
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
        loginBtn.textContent = 'Connect to NotebookLM';
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
        queueControls.style.flexDirection = 'column'; // Vertical layout for options
        queueControls.style.gap = '8px';

        // Options Container
        const optionsDiv = document.createElement('div');
        optionsDiv.style.display = 'flex';
        optionsDiv.style.alignItems = 'center';
        optionsDiv.style.gap = '8px';
        optionsDiv.style.fontSize = '12px';
        optionsDiv.style.color = 'var(--text-secondary)';

        const mergeCheck = document.createElement('input');
        mergeCheck.type = 'checkbox';
        mergeCheck.id = UI_CONTAINER_ID + '-queue-merge-check';
        // mergeCheck.checked = false; // Default to separate

        const mergeLabel = document.createElement('label');
        mergeLabel.htmlFor = mergeCheck.id;
        mergeLabel.textContent = 'Generate in single notebook';
        mergeLabel.style.cursor = 'pointer';

        optionsDiv.appendChild(mergeCheck);
        optionsDiv.appendChild(mergeLabel);
        queueControls.appendChild(optionsDiv);

        const buttonsDiv = document.createElement('div');
        buttonsDiv.style.display = 'flex';
        buttonsDiv.style.gap = '10px';

        const genQueueBtn = document.createElement('button');
        genQueueBtn.id = UI_CONTAINER_ID + '-queue-gen-btn';
        genQueueBtn.className = 'altrosyn-btn';
        genQueueBtn.textContent = 'Generate All';
        genQueueBtn.style.fontSize = '12px';
        genQueueBtn.onclick = startQueueGeneration;

        const clearQueueBtn = document.createElement('button');
        clearQueueBtn.id = UI_CONTAINER_ID + '-queue-clear-btn'; // Added ID
        clearQueueBtn.className = 'altrosyn-btn altrosyn-btn-secondary';
        clearQueueBtn.textContent = 'Clear';
        clearQueueBtn.style.fontSize = '12px';
        clearQueueBtn.style.width = 'auto';
        clearQueueBtn.onclick = clearQueue;

        buttonsDiv.appendChild(genQueueBtn);
        buttonsDiv.appendChild(clearQueueBtn);
        queueControls.appendChild(buttonsDiv);

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
        if (!currentVideoId) {
            generateBtn.textContent = 'Open a Video First';
            generateBtn.className = 'altrosyn-btn';
            generateBtn.disabled = true;
        } else {
            generateBtn.textContent = 'Generate Infographic';
            generateBtn.className = 'altrosyn-btn';
            generateBtn.disabled = false;
            generateBtn.onclick = startGeneration;
        }
    }

    // Update Queue UI
    // Update Queue UI
    updateQueueUI(status);

    // Shared Download Logic
    const triggerDownload = (e) => {
        e.preventDefault();

        // Robust Title Logic
        let videoTitle = title;
        if (!videoTitle) {
            // Fallback 1: YouTube H1
            const h1 = document.querySelector('h1.ytd-video-primary-info-renderer');
            if (h1) videoTitle = h1.textContent.trim();
        }
        if (!videoTitle) {
            // Fallback 2: Document Title
            videoTitle = document.title.replace(' - YouTube', '');
        }

        let filename = "infographic.png";
        if (videoTitle) {
            const safeTitle = videoTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
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
    } else if (message.type === 'QUEUE_UPDATE') {
        // message contains { videoId, status, message, imageUrl, error }
        // We can optionally pass this data to updateQueueUI to avoid a full fetch, 
        // but fetching states is safer to ensure consistency.
        updateQueueUI('QUEUE_PROCESSING');
        restoreStateForCurrentVideo();
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
    chrome.storage.local.get(['infographicQueue', 'infographicStates'], (result) => {
        const queue = result.infographicQueue || [];
        const states = result.infographicStates || {};

        const countEl = document.getElementById(UI_CONTAINER_ID + '-queue-count');
        const listEl = document.getElementById(UI_CONTAINER_ID + '-queue-list');
        const sectionEl = document.getElementById(UI_CONTAINER_ID + '-queue-section');
        const addBtn = document.getElementById(UI_CONTAINER_ID + '-queue-add-btn');
        const genBtn = document.getElementById(UI_CONTAINER_ID + '-queue-gen-btn');
        const clearBtn = document.getElementById(UI_CONTAINER_ID + '-queue-clear-btn');
        const mergeCheck = document.getElementById(UI_CONTAINER_ID + '-queue-merge-check');
        const statusEl = document.getElementById(UI_CONTAINER_ID + '-status');

        if (countEl) countEl.textContent = queue.length;
        if (sectionEl) sectionEl.style.display = 'flex';

        const currentId = extractVideoId(window.location.href);

        // Determine if ANY queue processing is active based on states or passed status
        // A simple heuristic: if any queued item is RUNNING, we are in Queue Mode
        const isQueueRunning = queue.some(item => states[item.videoId]?.status === 'RUNNING') || currentStatus === 'QUEUE_PROCESSING';

        // Add Button Logic
        if (addBtn) {
            if (isQueueRunning) {
                addBtn.disabled = true;
                addBtn.textContent = 'Queue Processing...';
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

        // Lock Clear Button and Checkbox
        if (clearBtn) clearBtn.disabled = isQueueRunning;
        if (mergeCheck) mergeCheck.disabled = isQueueRunning;

        // Render List
        if (listEl) {
            listEl.innerHTML = '';
            if (queue.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.textContent = 'Queue is empty';
                emptyMsg.style.fontSize = '12px';
                emptyMsg.style.color = 'var(--text-secondary)';
                emptyMsg.style.textAlign = 'center';
                emptyMsg.style.padding = '8px';
                listEl.appendChild(emptyMsg);
                if (genBtn) genBtn.disabled = true;
            } else {
                // Generate Button Logic
                if (genBtn) {
                    if (isQueueRunning) {
                        genBtn.disabled = true;

                        // Find which one is running (or if Merged mode, maybe all are running?)
                        const runningIndex = queue.findIndex(item => states[item.videoId]?.status === 'RUNNING');

                        if (runningIndex !== -1) {
                            const currentTitle = queue[runningIndex].title;
                            const shortTitle = currentTitle.length > 15 ? currentTitle.substring(0, 15) + '...' : currentTitle;
                            genBtn.textContent = `Processing ${runningIndex + 1}/${queue.length}: ${shortTitle}`;
                            if (statusEl) statusEl.textContent = `Processing video ${runningIndex + 1} of ${queue.length}...`;
                        } else {
                            // Maybe waiting between items or just starting
                            genBtn.textContent = 'Processing Queue...';
                        }

                    } else {
                        genBtn.disabled = false;
                        genBtn.textContent = 'Generate All';
                    }
                }

                queue.forEach((item, index) => {
                    const itemState = states[item.videoId] || {};
                    const isItemRunning = itemState.status === 'RUNNING';
                    const isItemCompleted = itemState.status === 'COMPLETED';
                    const isItemFailed = itemState.status === 'FAILED';

                    const row = document.createElement('div');
                    row.className = 'altrosyn-queue-item';

                    // Status Icon/Indicator
                    let statusIcon = '';
                    if (isItemRunning) statusIcon = '<span style="color:#2563eb; margin-right:6px;">↻</span>';
                    else if (isItemCompleted) statusIcon = '<span style="color:#137333; margin-right:6px;">✓</span>';
                    else if (isItemFailed) statusIcon = '<span style="color:#d93025; margin-right:6px;">⚠</span>';
                    else statusIcon = '<span style="color:#9aa0a6; margin-right:6px;">•</span>';

                    let actionBtn = '';
                    if (isItemCompleted && itemState.image_url) {
                        // View Button
                        actionBtn = `<button class="view-btn" style="border:none; background:none; color:#2563eb; font-weight:bold; cursor:pointer; font-size:11px; margin-left:6px;">View</button>`;
                    } else if (!isQueueRunning) {
                        // Remove Button (only if not running)
                        actionBtn = `<div class="altrosyn-queue-remove">×</div>`;
                    }

                    row.innerHTML = `
                        <div style="display:flex; align-items:center; overflow:hidden; flex:1;">
                            ${statusIcon}
                            <span title="${item.title}">${item.title}</span>
                        </div>
                        ${actionBtn}
                    `;

                    // Handlers
                    const viewBtn = row.querySelector('.view-btn');
                    if (viewBtn) {
                        viewBtn.onclick = (e) => {
                            e.stopPropagation();
                            // Trigger Download/View from background or just open URL
                            // Let's reuse the updateUI to show it in the main preview area!
                            updateUI('COMPLETED', itemState.image_url, null, item.title);
                            // Also scroll to top or something?
                        };
                    }

                    const removeBtn = row.querySelector('.altrosyn-queue-remove');
                    if (removeBtn) {
                        removeBtn.onclick = (e) => {
                            e.stopPropagation();
                            removeFromQueue(index);
                        };
                    }

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
    try {
        chrome.storage.local.get(['infographicQueue'], (result) => {
            const queue = result.infographicQueue || [];
            if (queue.length === 0) return;

            const mergeCheck = document.getElementById(UI_CONTAINER_ID + '-queue-merge-check');
            const mode = mergeCheck && mergeCheck.checked ? 'merged' : 'separate';

            updateQueueUI('QUEUE_PROCESSING');
            const statusEl = document.getElementById(UI_CONTAINER_ID + '-status');
            if (statusEl) statusEl.textContent = mode === 'merged' ? 'Merging videos...' : `Processing ${queue.length} videos...`;

            chrome.runtime.sendMessage({ type: 'GENERATE_QUEUE_INFOGRAPHIC', queue: queue, mode: mode });
        });
    } catch (e) {
        if (e.message.includes('invalidated')) {
            alert("Extension updated. Please refresh the page to continue.");
        } else {
            console.error(e);
        }
    }
}


function resetToInitialState() {
    const currentVideoId = extractVideoId(window.location.href);

    // If on Home Page (no video ID), we just want to clear the global sticky state.
    if (!currentVideoId) {
        chrome.storage.local.get(['infographicStates'], (result) => {
            // Just plain clear the lastActiveVideoId so nothing sticks.
            chrome.storage.local.set({ lastActiveVideoId: null }, () => {
                restoreStateForCurrentVideo();
            });
        });
        return;
    }

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
