// ===== Global Variables =====
let allData = [];
let filteredData = [];
let currentPage = 1;
let rowsPerPage = 10;
let currentSort = { column: null, direction: 'asc' };
let workflowIndex = {}; // workflow_index.json content

// Chart instances
let lineCountChartInstance, jobsChartInstance, stepsChartInstance;

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
    const totalFindings = data.reduce((sum, r) => sum + (r.findings || 0), 0);
    const totalLines = data.reduce((sum, r) => sum + (r.line_count || 0), 0);
    const avgLineCount = totalLines / data.length;
    const findingsPerLine = totalLines > 0 ? totalFindings / totalLines : 0;
    return { totalFindings, avgLineCount, findingsPerLine };
}

function renderTable(data, page=1, rows=rowsPerPage) {
    const container = document.getElementById("findingsTable");
    container.innerHTML = "";

    if (!data.length) {
        container.innerHTML = '<tr><td colspan="7" class="text-center">No data available</td></tr>';
        return;
    }

    const totalPages = Math.ceil(data.length / rows);
    const start = (page-1)*rows;
    const end = Math.min(start+rows, data.length);
    const pageData = data.slice(start,end);

    pageData.forEach(row => {
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
    document.querySelectorAll(".workflow-link").forEach(link => {
        link.addEventListener("click", async e => {
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
    const path = `data/${owner}/${repo}/${file}`;
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
        const response = await fetch('data/workflow_index.json');
        if (!response.ok) throw new Error("workflow_index.json not found");
        workflowIndex = await response.json();
        return true;
    } catch (err) {
        console.error("Error loading workflow_index.json:", err);
        workflowIndex = {};
        return false;
    }
}

// ===== Create Charts =====
function createCharts(data) {
    // Destroy existing charts if they exist
    if (lineCountChartInstance) lineCountChartInstance.destroy();
    if (jobsChartInstance) jobsChartInstance.destroy();
    if (stepsChartInstance) stepsChartInstance.destroy();
    
    // Prepare data for charts
    const lineCounts = data.map(d => d.line_count || 0);
    const jobsCounts = data.map(d => d.jobs || 0);
    const stepsPerJob = data.map(d => parseFloat(d.steps_per_job) || 0);
    
    // Create histogram data
    function createHistogramData(values, bins = 10) {
        const max = Math.max(...values);
        const min = Math.min(...values);
        const binSize = (max - min) / bins;
        
        const histogram = Array(bins).fill(0);
        values.forEach(value => {
            const binIndex = Math.min(Math.floor((value - min) / binSize), bins - 1);
            histogram[binIndex]++;
        });
        
        const labels = Array.from({length: bins}, (_, i) => 
            `${Math.round(min + i * binSize)}-${Math.round(min + (i+1) * binSize)}`
        );
        
        return { labels, data: histogram };
    }
    
    // Line Count Chart
    const lineCountHistogram = createHistogramData(lineCounts);
    lineCountChartInstance = new Chart(document.getElementById('lineCountChart'), {
        type: 'bar',
        data: {
            labels: lineCountHistogram.labels,
            datasets: [{
                label: 'Workflows by Line Count',
                data: lineCountHistogram.data,
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Line Count Distribution'
                },
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Workflows'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Line Count Range'
                    }
                }
            }
        }
    });
    
    // Jobs Chart
    const jobsHistogram = createHistogramData(jobsCounts, 5);
    jobsChartInstance = new Chart(document.getElementById('jobsChart'), {
        type: 'bar',
        data: {
            labels: jobsHistogram.labels,
            datasets: [{
                label: 'Workflows by Job Count',
                data: jobsHistogram.data,
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Jobs Distribution'
                },
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Workflows'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Job Count Range'
                    }
                }
            }
        }
    });
    
    // Steps Chart
    const stepsHistogram = createHistogramData(stepsPerJob);
    stepsChartInstance = new Chart(document.getElementById('stepsChart'), {
        type: 'bar',
        data: {
            labels: stepsHistogram.labels,
            datasets: [{
                label: 'Workflows by Steps/Job',
                data: stepsHistogram.data,
                backgroundColor: 'rgba(75, 192, 192, 0.5)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Steps per Job Distribution'
                },
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Workflows'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Steps per Job Range'
                    }
                }
            }
        }
    });
}

// ===== Populate Repository Filter =====
function populateRepoFilter(data) {
    const repoSelect = document.getElementById('repoSelect');
    const repos = [...new Set(data.map(item => item.repository))].sort();
    
    // Clear existing options except the first one
    while (repoSelect.options.length > 1) {
        repoSelect.remove(1);
    }
    
    // Add repository options
    repos.forEach(repo => {
        const option = document.createElement('option');
        option.value = repo;
        option.textContent = repo;
        repoSelect.appendChild(option);
    });
    
    // Add event listener for filtering
    repoSelect.addEventListener('change', function() {
        const selectedRepo = this.value;
        if (selectedRepo) {
            filteredData = allData.filter(item => item.repository === selectedRepo);
        } else {
            filteredData = [...allData];
        }
        currentPage = 1;
        renderTable(filteredData);
        updateStats(filteredData);
        createCharts(filteredData);
    });
}

// ===== Update Stats =====
function updateStats(data) {
    const stats = calculateStats(data);
    document.getElementById('totalFindings').textContent = stats.totalFindings.toLocaleString();
    document.getElementById('avgLineCount').textContent = Math.round(stats.avgLineCount);
    document.getElementById('findingsPerLine').textContent = stats.findingsPerLine.toFixed(4);
}

// ===== Load All Data =====
async function loadAllData() {
    const dataArray = [];
    
    // Check if workflow index was loaded successfully
    if (Object.keys(workflowIndex).length === 0) {
        console.error("Workflow index is empty");
        return dataArray;
    }

    for (const owner in workflowIndex) {
        for (const repo in workflowIndex[owner]) {
            for (const wfFile of workflowIndex[owner][repo]) {
                const path = `data/${owner}/${repo}/${wfFile}`;
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
        // Load workflow index first
        const indexLoaded = await loadWorkflowIndex();
        if (!indexLoaded) {
            throw new Error("Failed to load workflow index");
        }
        
        // Load all data
        allData = await loadAllData();
        filteredData = [...allData];

        // Update UI with data
        renderTable(filteredData);
        updateStats(allData);
        createCharts(allData);
        populateRepoFilter(allData);
        
        // Set up pagination
        document.getElementById('rowsPerPage').addEventListener('change', function() {
            rowsPerPage = parseInt(this.value);
            currentPage = 1;
            renderTable(filteredData, currentPage, rowsPerPage);
        });
        
        document.getElementById('prevPage').addEventListener('click', function(e) {
            e.preventDefault();
            if (currentPage > 1) {
                renderTable(filteredData, currentPage - 1, rowsPerPage);
            }
        });
        
        document.getElementById('nextPage').addEventListener('click', function(e) {
            e.preventDefault();
            const totalPages = Math.ceil(filteredData.length / rowsPerPage);
            if (currentPage < totalPages) {
                renderTable(filteredData, currentPage + 1, rowsPerPage);
            }
        });

        loadingOverlay.style.display = 'none';
    } catch (err) {
        console.error("Failed to initialize app:", err);
        document.getElementById('findingsTable').innerHTML = 
            '<tr><td colspan="7" class="text-center text-danger">Error loading data: ' + err.message + '</td></tr>';
        loadingOverlay.style.display = 'none';
    }
}

// ===== Start App =====
document.addEventListener("DOMContentLoaded", () => {
    initializeApp();
});
