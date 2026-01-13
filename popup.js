// popup.js

document.addEventListener('DOMContentLoaded', () => {
    const statusMessage = document.getElementById('status-message');
    const generateBtn = document.getElementById('generate-btn');
    const loadingDiv = document.getElementById('loading');
    const errorMessage = document.getElementById('error-message');
    const resultContainer = document.getElementById('result-container');
    const infographicImage = document.getElementById('infographic-image');
    const downloadLink = document.getElementById('download-link');

    // 1. Get current URL from the active tab
    // Since this popup is only enabled on valid YouTube pages, we verify merely for the URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        if (currentTab) {
            const url = currentTab.url;
            statusMessage.textContent = 'Ready to generate.';
            generateBtn.classList.remove('hidden');
            generateBtn.onclick = () => startGeneration(url);

            // Restore state if available
            chrome.storage.local.get(['infographicState'], (result) => {
                if (result.infographicState) {
                    restoreState(result.infographicState);
                }
            });
        } else {
            statusMessage.textContent = 'Error: No active tab found.';
        }
    });

    // Listen for state changes (e.g., completion while popup is open)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.infographicState) {
            restoreState(changes.infographicState.newValue);
        }
    });

    function restoreState(state) {
        if (!state) return;

        if (state.status === 'RUNNING') {
            generateBtn.disabled = true;
            generateBtn.classList.add('hidden');
            loadingDiv.classList.remove('hidden');
            errorMessage.classList.add('hidden');
            infographicImage.style.display = 'none';
            downloadLink.classList.add('hidden');
            statusMessage.textContent = 'Processing...';
        } else if (state.status === 'COMPLETED') {
            loadingDiv.classList.add('hidden');
            statusMessage.textContent = 'Infographic Generated!';
            infographicImage.src = state.image_url;
            infographicImage.style.display = 'block';

            downloadLink.href = state.image_url;
            downloadLink.classList.remove('hidden');

            generateBtn.textContent = 'Generate Again';
            generateBtn.disabled = false;
            generateBtn.classList.remove('hidden');
        } else if (state.status === 'FAILED') {
            loadingDiv.classList.add('hidden');
            showError(state.error || 'Unknown error.');
            generateBtn.disabled = false;
            generateBtn.classList.remove('hidden');
        }
    }

    function startGeneration(url) {
        // UI Updates
        generateBtn.disabled = true;
        generateBtn.classList.add('hidden'); // Hide button while processing
        loadingDiv.classList.remove('hidden');
        errorMessage.classList.add('hidden');
        infographicImage.style.display = 'none';
        downloadLink.classList.add('hidden');
        statusMessage.textContent = 'Processing...';

        // Send message to background to trigger backend API
        chrome.runtime.sendMessage({ type: 'GENERATE_INFOGRAPHIC', url: url }, (response) => {
            // Handle response
            loadingDiv.classList.add('hidden');

            if (chrome.runtime.lastError) {
                showError('Extension Error: ' + chrome.runtime.lastError.message);
                generateBtn.disabled = false;
                generateBtn.classList.remove('hidden');
                return;
            }

            if (response && response.success) {
                statusMessage.textContent = 'Infographic Generated!';
                infographicImage.src = response.imageUrl;
                infographicImage.style.display = 'block';

                downloadLink.href = response.imageUrl;
                downloadLink.classList.remove('hidden');

                // Keep button hidden or show "Generate Again"?
                generateBtn.textContent = 'Generate Again';
                generateBtn.disabled = false;
                generateBtn.classList.remove('hidden');

            } else {
                showError(response.error || 'Unknown error occurred.');
                generateBtn.disabled = false;
                generateBtn.classList.remove('hidden');
            }
        });
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.classList.remove('hidden');
        statusMessage.textContent = 'Error occurred.';
    }
});
