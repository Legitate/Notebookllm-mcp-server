// offscreen.js
setInterval(async () => {
    (await navigator.serviceWorker.ready).active.postMessage('keepAlive');
}, 20000); // 20 seconds
