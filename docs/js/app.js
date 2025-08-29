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

// Load workflow JSONs for selected repo
async function loadWorkflowData(owner, repo) {
    const workflows = workflowIndex[owner][repo];
    const data = [];
    for (const wfFile of workflows) {
        try {
            const response = await fetch(`./data/${owner}/${repo}/${wfFile}`);
            if (!response.ok) continue;
            const wfData = await response.json();
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
                        findings_per_line: meta.line_count ? (versions[ts].length/meta.line_count).toFixed(4) : 0,
                        yaml: meta.workflow
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
    const startIndex = (page-1)*rows;
    const endIndex = Math.min(startIndex+rows, data.length);
    const pageData = data.slice(startIndex,endIndex);
    for (const row of pageData) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${row.repository}</td>
            <td><a href="#" class="view-yaml" data-yaml="${encodeURIComponent(row.yaml)}">${row.workflow}</a></td>
            <td>${row.line_count}</td>
            <td>${row.jobs}</td>
            <td>${row.steps_per_job.toFixed(1)}</td>
            <td>${row.findings}</td>
            <td>${row.findings_per_line}</td>
        `;
        container.appendChild(tr);
    }
    document.getElementById("paginationInfo").textContent =
        `Showing ${startIndex+1} to ${endIndex} of ${data.length} entries`;
    document.getElementById("prevPage").parentElement.classList.toggle("disabled", page<=1);
    document.getElementById("nextPage").parentElement.classList.toggle("disabled", page>=totalPages);
    currentPage = page;

    // Add YAML click listeners
    document.querySelectorAll('.view-yaml').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            const yamlContent = decodeURIComponent(el.dataset.yaml);
            document.getElementById('yamlModalBody').textContent = yamlContent;
            const yamlModal = new bootstrap.Modal(document.getElementById('yamlModal'));
            yamlModal.show();
        });
    });
}

// Calculate stats
function calculateStats(data) {
    if (!data || data.length===0) return { totalFindings:0, avgLineCount:0, findingsPerLine:0 };
    const totalFindings = data.reduce((sum,row)=>sum+(row.findings||0),0);
    const avgLineCount = data.reduce((sum,row)=>sum+(row.line_count||0),0)/data.length;
    const findingsPerLine = totalFindings/data.reduce((sum,row)=>sum+(row.line_count||0),0);
    return { totalFindings, avgLineCount, findingsPerLine };
}

// Create charts
function createCharts(data) {
    if (!data || data.length===0) return;
    const lineCountData = data.map(row=>({x:row.line_count, y:row.findings}));
    const jobsData = data.map(row=>({x:row.jobs, y:row.findings}));
    const stepsData = data.map(row=>({x:row.steps_per_job, y:row.findings}));

    new Chart(document.getElementById('lineCountChart'), {
        type:'scatter',
        data:{datasets:[{label:'Line Count vs Findings',data:lineCountData,backgroundColor:'rgba(54,162,235,0.5)',borderColor:'rgba(54,162,235,1)',borderWidth:1}]},
        options:{scales:{x:{title:{display:true,text:'Line Count'}},y:{title:{display:true,text:'Findings'}}}}
    });
    new Chart(document.getElementById('jobsChart'), {
        type:'scatter',
        data:{datasets:[{label:'Jobs vs Findings',data:jobsData,backgroundColor:'rgba(75,192,192,0.5)',borderColor:'rgba(75,192,192,1)',borderWidth:1}]},
        options:{scales:{x:{title:{display:true,text:'Number of Jobs'}},y:{title:{display:true,text:'Findings'}}}}
    });
    new Chart(document.getElementById('stepsChart'), {
        type:'scatter',
        data:{datasets:[{label:'Steps/Job vs Findings',data:stepsData,backgroundColor:'rgba(255,99,132,0.5)',borderColor:'rgba(255,99,132,1)',borderWidth:1}]},
        options:{scales:{x:{title:{display:true,text:'Steps per Job'}},y:{title:{display:true,text:'Findings'}}}}
    });
}

// Event listeners
document.getElementById('repoSelect').addEventListener('change', async (e)=>{
    const [owner, repo] = e.target.value.split('|');
    if(!owner||!repo) return;
    allData = await loadWorkflowData(owner,repo);
    filteredData = [...allData];
    const stats = calculateStats(allData);
    document.getElementById('totalFindings').textContent = stats.totalFindings;
    document.getElementById('avgLineCount').textContent = stats.avgLineCount.toFixed(1);
    document.getElementById('findingsPerLine').textContent = stats.findingsPerLine.toFixed(4);
    renderTable(filteredData,1,rowsPerPage);
    createCharts(allData);
});

document.getElementById('rowsPerPage').addEventListener('change',(e)=>{
    rowsPerPage=parseInt(e.target.value);
    renderTable(filteredData,1,rowsPerPage);
});
document.getElementById('prevPage').addEventListener('click',(e)=>{
    e.preventDefault();
    if(currentPage>1) renderTable(filteredData,currentPage-1,rowsPerPage);
});
document.getElementById('nextPage').addEventListener('click',(e)=>{
    e.preventDefault();
    const totalPages = Math.ceil(filteredData.length/rowsPerPage);
    if(currentPage<totalPages) renderTable(filteredData,currentPage+1,rowsPerPage);
});

// Initialize app
async function initializeApp() {
    document.getElementById('loadingOverlay').style.display = 'flex';
    await loadWorkflowIndex();
    document.getElementById('loadingOverlay').style.display = 'none';
}
initializeApp();

