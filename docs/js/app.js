// ===== Global Variables =====
let allData = [];
let filteredData = [];
let currentPage = 1;
let rowsPerPage = 10;
let currentSort = { column: null, direction: 'asc' };
let workflowIndex = {}; // workflow_index.json content

// ===== Utility Functions =====
function parseStepsPerJob(stepsStr) {
    try {
        const stepsData = JSON.parse(stepsStr);
        const values = Object.values(stepsData);
        return values.length > 0 ? (values.reduce((a,b)=>a+b,0)/values.length).toFixed(1) : 0;
    } catch {
        return 0;
    }
}

function calculateStats(data) {
    if (!data || !data.length) return { totalFindings: 0, avgLineCount: 0, findingsPerLine: 0 };
    const totalFindings = data.reduce((sum,r)=>sum+(r.findings||0),0);
    const avgLineCount = data.reduce((sum,r)=>sum+(r.line_count||0),0)/data.length;
    const findingsPerLine = totalFindings/data.reduce((sum,r)=>sum+(r.line_count||0),0);
    return { totalFindings, avgLineCount, findingsPerLine };
}

function renderTable(data, page=1, rows=rowsPerPage) {
    const container = document.getElementById("findingsTable");
    container.innerHTML = "";

    if (!data.length) {
        container.innerHTML = '<tr><td colspan="8" class="text-center">No data available</td></tr>';
        return;
    }

    const totalPages = Math.ceil(data.length / rows);
    const start = (page-1)*rows;
    const end = Math.min(start+rows, data.length);
    const pageData = data.slice(start,end);

    pageData.forEach(row=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${row.repository||""}</td>
            <td><a href="#" class="workflow-link" data-owner="${row.owner}" data-repo="${row.repository}" data-file="${row.workflow}">${row.workflow||""}</a></td>
            <td>${row.line_count||""}</td>
            <td>${row.jobs||""}</td>
            <td>${row.steps_per_job||""}</td>
            <td>${row.findings||""}</td>
            <td>${row.findings_per_line||""}</td>
        `;
        container.appendChild(tr);
    });

    document.getElementById("paginationInfo").textContent =
        `Showing ${start+1} to ${end} of ${data.length} entries`;
    document.getElementById("prevPage").parentElement.classList.toggle("disabled", page <= 1);
    document.getElementById("nextPage").parentElement.classList.toggle("disabled", page >= totalPages);

    currentPage = page;

    // Add click handlers for workflow links
    document.querySelectorAll(".workflow-link").forEach(link=>{
        link.addEventListener("click", async e=>{
            e.preventDefault();
            const owner = link.dataset.owner;
            const repo = link.dataset.repo;
            const file = link.dataset.file;
            await showWorkflowYaml(owner, repo, file);
        });
    });
}

// ===== Fetch Workflow YAML =====
async function showWorkflowYaml(owner, repo, file) {
    const yamlContainer = document.getElementById("workflowYamlModalBody");
    yamlContainer.textContent = "Loading...";
    const path = `./data/${owner}/${repo}/${file}`;
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`File not found: ${path}`);
        const json = await response.json();
        yamlContainer.textContent = json.workflow || JSON.stringify(json, null, 2);
        const modal = new bootstrap.Modal(document.getElementById('workflowYamlModal'));
        modal.show();
    } catch (err) {
        console.error(err);
        yamlContainer.textContent = `Failed to load workflow: ${err.message}`;
    }
}

// ===== Load Workflow Index =====
async function loadWorkflowIndex() {
    try {
        const response = await fetch('./data/workflow_index.json');
        if (!response.ok) throw new Error("workflow_index.json not found");
        workflowIndex = await response.json();
    } catch (err) {
        console.error("Error loading workflow_index.json:", err);
        workflowIndex = {};
    }
}

// ===== Load All Data =====
async function loadAllData() {
    await loadWorkflowIndex();

    const dataArray = [];

    for (const owner in workflowIndex) {
        for (const repo in workflowIndex[owner]) {
            for (const wfFile of workflowIndex[owner][repo]) {
                const path = `./data/${owner}/${repo}/${wfFile}`;
                try {
                    const resp = await fetch(path);
                    if (!resp.ok) throw new Error(`File not found: ${path}`);
                    const json = await resp.json();

                    // Metadata extraction
                    const stepsAvg = parseStepsPerJob(JSON.stringify(json.steps_per_job || {}));
                    const lineCount = json.line_count || 0;
                    const numJobs = json.num_jobs || 0;
                    const findingsCount = (json.findings || []).length || 0;

                    dataArray.push({
                        owner,
                        repository: repo,
                        workflow: wfFile,
                        line_count: lineCount,
                        jobs: numJobs,
                        steps_per_job: stepsAvg,
                        findings: findingsCount,
                        findings_per_line: lineCount ? (findingsCount/lineCount).toFixed(4) : 0
                    });
                } catch (err) {
                    console.warn("Skipping file:", path, err.message);
                }
            }
        }
    }

    return dataArray;
}

// ===== Initialize App =====
async function initializeApp() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    try {
        allData = await loadAllData();
        filteredData = [...allData];

        renderTable(filteredData);

        const stats = calculateStats(allData);
        document.getElementById('totalFindings').textContent = stats.totalFindings.toLocaleString();
        document.getElementById('avgLineCount').textContent = Math.round(stats.avgLineCount);
        document.getElementById('findingsPerLine').textContent = stats.findingsPerLine.toFixed(4);

        loadingOverlay.style.display = 'none';
    } catch (err) {
        console.error("Failed to initialize app:", err);
        loadingOverlay.style.display = 'none';
    }
}

// ===== Start App =====
initializeApp();

