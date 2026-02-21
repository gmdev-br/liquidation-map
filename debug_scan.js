// Debug script to test scan functionality
console.log('Debug: Loading debug script...');

// Test if all required functions are available
async function debugScan() {
    console.log('Debug: Starting scan test...');
    
    try {
        // Test imports
        const { startScan } = await import('./js/api/leaderboard.js');
        const { setStatus, setProgress } = await import('./js/ui/status.js');
        const { fetchAllMids } = await import('./js/api/exchangeRates.js');
        const { updateStats, renderTable } = await import('./js/ui/table.js');
        const { updateCoinFilter } = await import('./js/ui/combobox.js');
        const { saveTableData } = await import('./js/storage/data.js');
        const { finishScan } = await import('./js/api/leaderboard.js');
        const { setLastSaveTime, setRenderPending } = await import('./js/state.js');
        
        console.log('Debug: All imports successful');
        
        // Test DOM elements
        const scanBtn = document.getElementById('scanBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const stopBtn = document.getElementById('stopBtn');
        const tableBody = document.getElementById('tableBody');
        
        console.log('Debug: DOM elements:', {
            scanBtn: !!scanBtn,
            pauseBtn: !!pauseBtn,
            stopBtn: !!stopBtn,
            tableBody: !!tableBody
        });
        
        // Test API calls
        console.log('Debug: Testing API calls...');
        await fetchAllMids();
        console.log('Debug: fetchAllMids completed');
        
        // Test scan start
        console.log('Debug: Starting scan...');
        await startScan({
            setStatus,
            setProgress,
            fetchAllMids,
            updateStats,
            updateCoinFilter,
            renderTable,
            saveTableData,
            finishScan,
            setLastSaveTime,
            setRenderPending
        });
        
        console.log('Debug: Scan completed successfully');
        
    } catch (error) {
        console.error('Debug: Error during scan test:', error);
    }
}

// Add debug button to page
function addDebugButton() {
    const debugBtn = document.createElement('button');
    debugBtn.textContent = 'Debug Scan';
    debugBtn.style.position = 'fixed';
    debugBtn.style.top = '10px';
    debugBtn.style.right = '10px';
    debugBtn.style.zIndex = '9999';
    debugBtn.style.background = 'red';
    debugBtn.style.color = 'white';
    debugBtn.style.padding = '10px';
    debugBtn.style.border = 'none';
    debugBtn.style.borderRadius = '5px';
    debugBtn.style.cursor = 'pointer';
    
    debugBtn.addEventListener('click', debugScan);
    document.body.appendChild(debugBtn);
    
    console.log('Debug: Debug button added');
}

// Add debug button when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addDebugButton);
} else {
    addDebugButton();
}

console.log('Debug: Debug script loaded');
