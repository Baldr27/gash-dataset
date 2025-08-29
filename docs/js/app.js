// Global variables
let allData = [];
let filteredData = [];
let currentPage = 1;
let rowsPerPage = 10;
let workflowIndex = {};

// Load workflow index
async function loadWorkflowIndex() {
    try {
        const response = await fetch('./data/workflow_index.json');
        if (!response.ok) throw new Error("Failed to load workflow index");
        workflowIndex = await response.json();

        // Populate owner dropdown
        const repoSelect = document.getElementById('repoSelect');
        for (const owner of Object.keys(workflowIndex)) {
            for (const repo of Object.keys(workflowIndex[owner])) {
                const option = document.createElement('option');
                option.value = `${owner}|${repo}`;
                option.textContent = `${owner}/${repo}`;
                repoSelect.appendChild(option);
            }
        }
    } catch (error) {
        console.error("Error loading workflow index:", error);
    }
}

// Load individual workflow JSONs for selected repo
async function loadWorkflowData(owner, repo) {
    const workflows = workflowIndex[owner][repo];
    const data = [];
    for (const wfFile of workflows) {
        try {
            const response = await fetch(`./data/${owner}/${repo}/${wfFile}`);
            if (!response.ok) continue;
            const wfData = await response.json();
            // Flatten each workflow file into a row for the table
            for (const wfName in wfData) {
                if (wfName === 'metadata') continue;
                const versions = wfData[wfName];
                for (const ts in versions) {
                    const meta = wfData['metadata'][ts];
                    data.push({
                        repository: `${owner}/${repo}`,
                        workflow: wfName,
                        line_count: meta.line_count,
                        jobs: meta.num_jobs,
                        steps_per_job: Object.values(meta.steps_per_job || {}).reduce((a,b)=>a+b,0)/Object.keys(meta.steps_per_job || {}).length || 0,
                        findings: versions[ts].length,
                        findings_per_line: meta.line_count ? (versions[ts].length/meta.line_count).toFixed(4) : 0
                    });
                }
            }
        } catch (e) { console.error(`Failed to load ${wfFile}:`, e); }
    }
    return data;
}

// Render table
function renderTable(data, page = 1, rows = rowsPerPage) {
    const container = document.getElementById("findingsTable");
    container.innerHTML = "";
    if (!data || data.length === 0) {
        container.innerHTML = '<tr><td colspan="7" class="text-center">No data available</td></tr>';
        return;
    }
    const totalPages = Math.ceil(data.length / rows);
    const startIndex = (page - 1) * rows;
    const endIndex = Math.min(startIndex + rows, data.length);
    const pageData = data.slice(startIndex, endIndex);
    for (let row of pageData) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${row.repository || ""}</td>
            <td>${row.workflow || ""}</td>
            <td>${row.line_count || ""}</td>
            <td>${row.jobs || ""}</td>
            <td>${row.steps_per_job.toFixed(1) || ""}</td>
            <td>${row.findings || ""}</td>
            <td>${row.findings_per_line || ""}</td>
        `;
        container.appendChild(tr);
    }
    document.getElementById("paginationInfo").textContent =
        `Showing ${startIndex+1} to ${endIndex} of ${data.length} entries`;
    document.getElementById("prevPage").parentElement.classList.toggle("disabled", page <= 1);
    document.getElementById("nextPage").parentElement.classList.toggle("disabled", page >= totalPages);
    currentPage = page;
}

// Event listeners
document.getElementById('repoSelect').addEventListener('change', async (e) => {
    const [owner, repo] = e.target.value.split('|');
    if (!owner || !repo) return;
    allData = await loadWorkflowData(owner, repo);
    filteredData = [...allData];
    renderTable(filteredData, 1, rowsPerPage);
});

document.getElementById('rowsPerPage').addEventListener('change', (e) => {
    rowsPerPage = parseInt(e.target.value);
    renderTable(filteredData, 1, rowsPerPage);
});

document.getElementById('prevPage').addEventListener('click', (e) => {
    e.preventDefault();
    if (currentPage > 1) renderTable(filteredData, currentPage-1, rowsPerPage);
});

document.getElementById('nextPage').addEventListener('click', (e) => {
    e.preventDefault();
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    if (currentPage < totalPages) renderTable(filteredData, currentPage+1, rowsPerPage);
});

// Initialize app
async function initializeApp() {
    document.getElementById('loadingOverlay').style.display = 'flex';
    await loadWorkflowIndex();
    document.getElementById('loadingOverlay').style.display = 'none';
}

initializeApp();

