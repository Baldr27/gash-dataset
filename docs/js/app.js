// Initialize DuckDB
async function initDuckDB() {
    try {
        // Load DuckDB-WASM
        const JSDELIVR_CDN = 'https://cdn.jsdelivr.net/npm/duckdb@0.9.2/dist/duckdb.wasm';
        const DUCKDB_VERSION = '0.9.2';
        
        // Load the DuckDB module
        const DuckDB = await import('https://cdn.jsdelivr.net/npm/duckdb@0.9.2/+esm');
        const db = new DuckDB.Database('memory');
        const conn = db.connect();
        
        // Load parquet files
        await loadParquetFiles(conn);
        
        // Query and visualize data
        await visualizeData(conn);
        
    } catch (error) {
        console.error('Error initializing DuckDB:', error);
        document.body.innerHTML = `<div class="loading">Error loading data: ${error.message}</div>`;
    }
}

// Load parquet files
async function loadParquetFiles(conn) {
    try {
        // Load findings data
        await conn.query(`
            CREATE TABLE findings AS 
            SELECT * FROM parquet_scan('./data/findings.parquet')
        `);
        
        // Load metadata
        await conn.query(`
            CREATE TABLE metadata AS 
            SELECT * FROM parquet_scan('./data/workflow_metadata.parquet')
        `);
        
        console.log('Data loaded successfully');
    } catch (error) {
        console.error('Error loading parquet files:', error);
        throw error;
    }
}

// Visualize the data
async function visualizeData(conn) {
    try {
        // Get repository list for filter
        const repoResult = await conn.query(`
            SELECT DISTINCT repo_name FROM findings ORDER BY repo_name
        `);
        
        const repoFilter = document.getElementById('repoFilter');
        repoResult.forEach(row => {
            const option = document.createElement('option');
            option.value = row.repo_name;
            option.textContent = row.repo_name;
            repoFilter.appendChild(option);
        });
        
        // Set up filter event listeners
        repoFilter.addEventListener('change', () => updateVisualizations(conn));
        document.getElementById('severityFilter').addEventListener('change', () => updateVisualizations(conn));
        
        // Initial visualization
        await updateVisualizations(conn);
        
    } catch (error) {
        console.error('Error visualizing data:', error);
    }
}

// Update visualizations based on filters
async function updateVisualizations(conn) {
    try {
        const repoFilter = document.getElementById('repoFilter').value;
        const severityFilter = document.getElementById('severityFilter').value;
        
        // Build WHERE clause based on filters
        let whereClause = '';
        if (repoFilter) whereClause += ` AND repo_name = '${repoFilter.replace(/'/g, "''")}'`;
        if (severityFilter) whereClause += ` AND severity = '${severityFilter}'`;
        if (whereClause) whereClause = 'WHERE ' + whereClause.substring(5);
        
        // Query for repository chart
        const repoData = await conn.query(`
            SELECT repo_name, COUNT(*) as count 
            FROM findings 
            ${whereClause}
            GROUP BY repo_name 
            ORDER BY count DESC
        `);
        
        // Query for severity chart
        const severityData = await conn.query(`
            SELECT severity, COUNT(*) as count 
            FROM findings 
            ${whereClause}
            GROUP BY severity 
            ORDER BY count DESC
        `);
        
        // Query for timeline chart
        const timelineData = await conn.query(`
            SELECT date_trunc('month', version_ts) as month, severity, COUNT(*) as count
            FROM findings 
            ${whereClause}
            GROUP BY month, severity 
            ORDER BY month
        `);
        
        // Query for table data
        const tableData = await conn.query(`
            SELECT repo_name, workflow_name, rule_id, severity, message, version_ts
            FROM findings 
            ${whereClause}
            ORDER BY version_ts DESC
            LIMIT 100
        `);
        
        // Render visualizations
        renderRepoChart(repoData);
        renderSeverityChart(severityData);
        renderTimelineChart(timelineData);
        renderTable(tableData);
        
    } catch (error) {
        console.error('Error updating visualizations:', error);
    }
}

// Render repository chart
function renderRepoChart(data) {
    const ctx = document.getElementById('repoChart').getContext('2d');
    
    if (window.repoChartInstance) {
        window.repoChartInstance.destroy();
    }
    
    window.repoChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(row => row.repo_name),
            datasets: [{
                label: 'Number of Findings',
                data: data.map(row => row.count),
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Render severity chart
function renderSeverityChart(data) {
    const ctx = document.getElementById('severityChart').getContext('2d');
    
    if (window.severityChartInstance) {
        window.severityChartInstance.destroy();
    }
    
    // Define colors based on severity
    const colors = {
        'warning': 'rgba(255, 206, 86, 0.5)',
        'error': 'rgba(255, 99, 132, 0.5)'
    };
    
    window.severityChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: data.map(row => row.severity),
            datasets: [{
                data: data.map(row => row.count),
                backgroundColor: data.map(row => colors[row.severity] || 'rgba(0, 0, 0, 0.1)'),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true
        }
    });
}

// Render timeline chart
function renderTimelineChart(data) {
    const ctx = document.getElementById('timelineChart').getContext('2d');
    
    if (window.timelineChartInstance) {
        window.timelineChartInstance.destroy();
    }
    
    // Group data by month and severity
    const months = [...new Set(data.map(row => row.month))].sort();
    const severities = [...new Set(data.map(row => row.severity))];
    
    const datasets = severities.map(severity => {
        return {
            label: severity,
            data: months.map(month => {
                const match = data.find(row => row.month === month && row.severity === severity);
                return match ? match.count : 0;
            }),
            fill: false,
            tension: 0.1
        };
    });
    
    window.timelineChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months.map(month => new Date(month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })),
            datasets: datasets
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Render data table
function renderTable(data) {
    const tableBody = document.querySelector('#findingsTable tbody');
    tableBody.innerHTML = '';
    
    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(row.repo_name)}</td>
            <td>${escapeHtml(row.workflow_name)}</td>
            <td>${escapeHtml(row.rule_id)}</td>
            <td>${escapeHtml(row.severity)}</td>
            <td>${escapeHtml(row.message)}</td>
            <td>${new Date(row.version_ts).toLocaleDateString()}</td>
        `;
        tableBody.appendChild(tr);
    });
}

// Helper function to escape HTML
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', initDuckDB);
