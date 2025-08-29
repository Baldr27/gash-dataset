// ===== Global Variables =====
let allData = [];
let filteredData = [];
let currentPage = 1;
let rowsPerPage = 10;
let currentSort = { column: null, direction: 'asc' };
let workflowIndex = {}; // workflow_index.json content

// Chart instances
let lineCountCorrelationChart, jobsCorrelationChart, stepsCorrelationChart, vulnerabilityDistributionChart;

// ===== Utility Functions =====
function parseStepsPerJob(stepsStr) {
    try {
        if (typeof stepsStr === 'object') {
            const values = Object.values(stepsStr);
            return values.length > 0 ? (values.reduce((a,b)=>a+b,0)/values.length).toFixed(1) : 0;
        }
        const stepsData = JSON.parse(stepsStr);
        const values = Object.values(stepsData);
        return values.length > 0 ? (values.reduce((a,b)=>a+b,0)/values.length).toFixed(1) : 0;
    } catch {
        return 0;
    }
}

function calculateStats(data) {
    if (!data || !data.length) return { totalFindings: 0, avgLineCount: 0, findingsPerLine: 0, totalWorkflows: 0 };
    const totalFindings = data.reduce((sum, r) => sum + (r.findings || 0), 0);
    const totalLines = data.reduce((sum, r) => sum + (r.line_count || 0), 0);
    const avgLineCount = totalLines / data.length;
    const findingsPerLine = totalLines > 0 ? totalFindings / totalLines : 0;
    const totalWorkflows = data.length;
    return { totalFindings, avgLineCount, findingsPerLine, totalWorkflows };
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
        
        // Extract the workflow YAML from metadata
        let workflowYaml = "No workflow content found";
        if (json.metadata) {
            // Get the latest timestamp
            const timestamps = Object.keys(json.metadata);
            if (timestamps.length > 0) {
                const latestTimestamp = timestamps.sort().reverse()[0];
                workflowYaml = json.metadata[latestTimestamp].workflow || workflowYaml;
            }
        }
        
        yamlContainer.textContent = workflowYaml;
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

// ===== Create Correlation Charts =====
function createCorrelationCharts(data) {
    // Destroy existing charts if they exist
    if (lineCountCorrelationChart) lineCountCorrelationChart.destroy();
    if (jobsCorrelationChart) jobsCorrelationChart.destroy();
    if (stepsCorrelationChart) stepsCorrelationChart.destroy();
    if (vulnerabilityDistributionChart) vulnerabilityDistributionChart.destroy();
    
    // Prepare data for correlation analysis
    const lineCounts = data.map(d => d.line_count || 0);
    const jobsCounts = data.map(d => d.jobs || 0);
    const stepsPerJob = data.map(d => parseFloat(d.steps_per_job) || 0);
    const findings = data.map(d => d.findings || 0);
    
    // Create scatter plot data
    const lineCountVsFindings = data.map(d => ({x: d.line_count || 0, y: d.findings || 0}));
    const jobsVsFindings = data.map(d => ({x: d.jobs || 0, y: d.findings || 0}));
    const stepsVsFindings = data.map(d => ({x: parseFloat(d.steps_per_job) || 0, y: d.findings || 0}));
    
    // Calculate correlation coefficients
    const lineCountCorrelation = calculateCorrelation(lineCounts, findings);
    const jobsCorrelation = calculateCorrelation(jobsCounts, findings);
    const stepsCorrelation = calculateCorrelation(stepsPerJob, findings);
    
    // Create regression lines
    const lineCountRegression = regression.linear(lineCountVsFindings);
    const jobsRegression = regression.linear(jobsVsFindings);
    const stepsRegression = regression.linear(stepsVsFindings);
    
    // Line Count vs Findings Chart
    const lineCountCtx = document.getElementById('lineCountCorrelationChart').getContext('2d');
    lineCountCorrelationChart = new Chart(lineCountCtx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Workflows',
                data: lineCountVsFindings,
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                pointRadius: 4,
                pointHoverRadius: 6
            }, {
                label: 'Trend Line',
                data: lineCountRegression.points,
                type: 'line',
                fill: false,
                borderColor: 'rgba(255, 99, 132, 0.8)',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Line Count vs Vulnerabilities'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Lines: ${context.raw.x}, Findings: ${context.raw.y}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Line Count'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Number of Vulnerabilities'
                    }
                }
            }
        }
    });
    
    // Jobs vs Findings Chart
    const jobsCtx = document.getElementById('jobsCorrelationChart').getContext('2d');
    jobsCorrelationChart = new Chart(jobsCtx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Workflows',
                data: jobsVsFindings,
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                pointRadius: 4,
                pointHoverRadius: 6
            }, {
                label: 'Trend Line',
                data: jobsRegression.points,
                type: 'line',
                fill: false,
                borderColor: 'rgba(54, 162, 235, 0.8)',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Job Count vs Vulnerabilities'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Jobs: ${context.raw.x}, Findings: ${context.raw.y}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Number of Jobs'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Number of Vulnerabilities'
                    }
                }
            }
        }
    });
    
    // Steps per Job vs Findings Chart
    const stepsCtx = document.getElementById('stepsCorrelationChart').getContext('2d');
    stepsCorrelationChart = new Chart(stepsCtx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Workflows',
                data: stepsVsFindings,
                backgroundColor: 'rgba(75, 192, 192, 0.5)',
                pointRadius: 4,
                pointHoverRadius: 6
            }, {
                label: 'Trend Line',
                data: stepsRegression.points,
                type: 'line',
                fill: false,
                borderColor: 'rgba(255, 99, 132, 0.8)',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Steps per Job vs Vulnerabilities'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Steps/Job: ${context.raw.x.toFixed(1)}, Findings: ${context.raw.y}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Average Steps per Job'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Number of Vulnerabilities'
                    }
                }
            }
        }
    });
    
    // Vulnerability Distribution Chart
    const vulnerabilityDistribution = [0, 0, 0, 0, 0]; // 0, 1-2, 3-5, 6-10, 10+
    findings.forEach(count => {
        if (count === 0) vulnerabilityDistribution[0]++;
        else if (count <= 2) vulnerabilityDistribution[1]++;
        else if (count <= 5) vulnerabilityDistribution[2]++;
        else if (count <= 10) vulnerabilityDistribution[3]++;
        else vulnerabilityDistribution[4]++;
    });
    
    const distributionCtx = document.getElementById('vulnerabilityDistributionChart').getContext('2d');
    vulnerabilityDistributionChart = new Chart(distributionCtx, {
        type: 'bar',
        data: {
            labels: ['0', '1-2', '3-5', '6-10', '10+'],
            datasets: [{
                label: 'Number of Workflows',
                data: vulnerabilityDistribution,
                backgroundColor: [
                    'rgba(75, 192, 192, 0.5)',
                    'rgba(54, 162, 235, 0.5)',
                    'rgba(255, 206, 86, 0.5)',
                    'rgba(255, 159, 64, 0.5)',
                    'rgba(255, 99, 132, 0.5)'
                ],
                borderColor: [
                    'rgba(75, 192, 192, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 206, 86, 1)',
                    'rgba(255, 159, 64, 1)',
                    'rgba(255, 99, 132, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Vulnerability Distribution'
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
                        text: 'Number of Vulnerabilities'
                    }
                }
            }
        }
    });
    
    // Update correlation summaries
    document.getElementById('lineCountSummary').innerHTML = `
        <p class="text-center"><span class="correlation">Correlation: ${lineCountCorrelation.toFixed(3)}</span></p>
        <p class="interpretation text-center">${interpretCorrelation(lineCountCorrelation, 'line count')}</p>
    `;
    
    document.getElementById('jobsSummary').innerHTML = `
        <p class="text-center"><span class="correlation">Correlation: ${jobsCorrelation.toFixed(3)}</span></p>
        <p class="interpretation text-center">${interpretCorrelation(jobsCorrelation, 'job count')}</p>
    `;
    
    document.getElementById('stepsSummary').innerHTML = `
        <p class="text-center"><span class="correlation">Correlation: ${stepsCorrelation.toFixed(3)}</span></p>
        <p class="interpretation text-center">${interpretCorrelation(stepsCorrelation, 'steps per job')}</p>
    `;
    
    document.getElementById('distributionSummary').innerHTML = `
        <p class="text-center"><span class="correlation">Workflows with vulnerabilities: ${((data.length - vulnerabilityDistribution[0]) / data.length * 100).toFixed(1)}%</span></p>
        <p class="interpretation text-center">${vulnerabilityDistribution[0]} workflows have no vulnerabilities</p>
    `;
}

// Calculate correlation coefficient
function calculateCorrelation(x, y) {
    if (x.length !== y.length || x.length === 0) return 0;
    
    const n = x.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    
    for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumX2 += x[i] * x[i];
        sumY2 += y[i] * y[i];
    }
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
}

// Interpret correlation value
function interpretCorrelation(correlation, metric) {
    const absCorrelation = Math.abs(correlation);
    
    if (absCorrelation < 0.1) {
        return `No significant relationship between ${metric} and vulnerabilities`;
    } else if (absCorrelation < 0.3) {
        return `Weak ${correlation > 0 ? 'positive' : 'negative'} relationship between ${metric} and vulnerabilities`;
    } else if (absCorrelation < 0.5) {
        return `Moderate ${correlation > 0 ? 'positive' : 'negative'} relationship between ${metric} and vulnerabilities`;
    } else if (absCorrelation < 0.7) {
        return `Strong ${correlation > 0 ? 'positive' : 'negative'} relationship between ${metric} and vulnerabilities`;
    } else {
        return `Very strong ${correlation > 0 ? 'positive' : 'negative'} relationship between ${metric} and vulnerabilities`;
    }
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
        createCorrelationCharts(filteredData);
    });
}

// ===== Update Stats =====
function updateStats(data) {
    const stats = calculateStats(data);
    document.getElementById('totalFindings').textContent = stats.totalFindings.toLocaleString();
    document.getElementById('avgLineCount').textContent = Math.round(stats.avgLineCount);
    document.getElementById('findingsPerLine').textContent = stats.findingsPerLine.toFixed(4);
    document.getElementById('totalWorkflows').textContent = stats.totalWorkflows.toLocaleString();
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

                    // Extract findings count from the JSON structure
                    let findingsCount = 0;
                    
                    // Find the workflow name (any key that's not "metadata")
                    let workflowName = null;
                    for (const key in json) {
                        if (key !== "metadata") {
                            workflowName = key;
                            break;
                        }
                    }
                    
                    if (workflowName && json[workflowName]) {
                        // Sum findings across all timestamps for this workflow
                        for (const timestamp in json[workflowName]) {
                            findingsCount += json[workflowName][timestamp].length;
                        }
                    }
                    
                    // Extract metadata from the latest timestamp
                    let lineCount = 0;
                    let numJobs = 0;
                    let stepsPerJob = "{}";
                    
                    if (json.metadata) {
                        // Get the latest timestamp
                        const timestamps = Object.keys(json.metadata);
                        if (timestamps.length > 0) {
                            const latestTimestamp = timestamps.sort().reverse()[0];
                            const metadata = json.metadata[latestTimestamp];
                            
                            lineCount = metadata.line_count || 0;
                            numJobs = metadata.num_jobs || 0;
                            stepsPerJob = JSON.stringify(metadata.steps_per_job || {});
                        }
                    }

                    const stepsAvg = parseStepsPerJob(stepsPerJob);

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
        createCorrelationCharts(allData);
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
