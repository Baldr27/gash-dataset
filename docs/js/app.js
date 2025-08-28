import * as duckdb from "./duckdb.js";

// Initialize DuckDB and connect
async function initDuckDB() {
    const worker = new Worker("./duckdb.js");
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
    await db.instantiate();
    const conn = await db.connect();

    // Load parquet files
    await conn.query(`
        CREATE OR REPLACE TABLE findings AS
        SELECT * FROM parquet_scan('data/findings.parquet');
    `);

    await conn.query(`
        CREATE OR REPLACE TABLE metadata AS
        SELECT * FROM parquet_scan('data/workflow_metadata.parquet');
    `);

    return conn;
}

// Utility: run query and return rows
async function queryRows(conn, sql) {
    const result = await conn.query(sql);
    return result.toArray().map(Object.fromEntries);
}

// Update the stats cards
async function updateStats(conn) {
    const totalFindings = await queryRows(conn, `SELECT COUNT(*) AS cnt FROM findings`);
    const avgLineCount = await queryRows(conn, `SELECT AVG(line_count) AS avg FROM metadata`);
    const findingsPerLine = await queryRows(conn, `
        SELECT (COUNT(*) * 100.0 / SUM(line_count)) AS ratio
        FROM findings f JOIN metadata m ON f.workflow_id = m.workflow_id
    `);

    document.getElementById("totalFindings").innerText = totalFindings[0].cnt;
    document.getElementById("avgLineCount").innerText = avgLineCount[0].avg.toFixed(1);
    document.getElementById("findingsPerLine").innerText = findingsPerLine[0].ratio.toFixed(2);
}

// Chart helper
function makeScatterChart(ctx, label, xLabel, yLabel, points) {
    return new Chart(ctx, {
        type: "scatter",
        data: {
            datasets: [{
                label: label,
                data: points,
                backgroundColor: "rgba(54, 162, 235, 0.6)"
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: { title: { display: true, text: xLabel } },
                y: { title: { display: true, text: yLabel } }
            }
        }
    });
}

// Render charts
async function renderCharts(conn) {
    const lineCount = await queryRows(conn, `
        SELECT m.line_count AS x, COUNT(f.*) AS y
        FROM metadata m LEFT JOIN findings f ON f.workflow_id = m.workflow_id
        GROUP BY m.line_count
    `);

    makeScatterChart(
        document.getElementById("lineCountChart"),
        "Line Count vs Findings",
        "Line Count",
        "Findings",
        lineCount
    );

    const jobs = await queryRows(conn, `
        SELECT m.jobs AS x, COUNT(f.*) AS y
        FROM metadata m LEFT JOIN findings f ON f.workflow_id = m.workflow_id
        GROUP BY m.jobs
    `);

    makeScatterChart(
        document.getElementById("jobsChart"),
        "Jobs vs Findings",
        "Jobs",
        "Findings",
        jobs
    );

    const steps = await queryRows(conn, `
        SELECT m.steps AS x, COUNT(f.*) AS y
        FROM metadata m LEFT JOIN findings f ON f.workflow_id = m.workflow_id
        GROUP BY m.steps
    `);

    makeScatterChart(
        document.getElementById("stepsChart"),
        "Steps vs Findings",
        "Steps per Job",
        "Findings",
        steps
    );
}

// Fill table
async function fillTable(conn) {
    const rows = await queryRows(conn, `
        SELECT m.repo, m.workflow, m.line_count, m.jobs, m.steps,
               COUNT(f.*) AS findings,
               COUNT(f.*) * 1.0 / NULLIF(m.line_count,0) AS findings_per_line
        FROM metadata m LEFT JOIN findings f ON f.workflow_id = m.workflow_id
        GROUP BY m.repo, m.workflow, m.line_count, m.jobs, m.steps
        ORDER BY findings DESC
        LIMIT 100
    `);

    const tbody = document.getElementById("findingsTable");
    tbody.innerHTML = "";
    rows.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${r.repo}</td>
            <td>${r.workflow}</td>
            <td>${r.line_count}</td>
            <td>${r.jobs}</td>
            <td>${r.steps}</td>
            <td>${r.findings}</td>
            <td>${(r.findings_per_line*100).toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Populate repo/workflow dropdowns
async function populateDropdowns(conn) {
    const repos = await queryRows(conn, `SELECT DISTINCT repo FROM metadata ORDER BY repo`);
    const repoSelect = document.getElementById("repoSelect");
    repos.forEach(r => {
        const opt = document.createElement("option");
        opt.value = r.repo;
        opt.text = r.repo;
        repoSelect.appendChild(opt);
    });

    repoSelect.addEventListener("change", async () => {
        const workflows = await queryRows(conn, `
            SELECT DISTINCT workflow FROM metadata WHERE repo = '${repoSelect.value}'
        `);
        const workflowSelect = document.getElementById("workflowSelect");
        workflowSelect.innerHTML = `<option value="">Select Workflow</option>`;
        workflows.forEach(w => {
            const opt = document.createElement("option");
            opt.value = w.workflow;
            opt.text = w.workflow;
            workflowSelect.appendChild(opt);
        });
    });
}

// Hook up "Analyze Evolution" button
function setupEvolution(conn) {
    document.getElementById("analyzeBtn").addEventListener("click", async () => {
        const repo = document.getElementById("repoSelect").value;
        const wf = document.getElementById("workflowSelect").value;
        if (!repo || !wf) return;

        const evo = await queryRows(conn, `
            SELECT m.commit_date AS x, COUNT(f.*) AS y
            FROM metadata m LEFT JOIN findings f ON f.workflow_id = m.workflow_id
            WHERE m.repo = '${repo}' AND m.workflow = '${wf}'
            GROUP BY m.commit_date
            ORDER BY m.commit_date
        `);

        new Chart(document.getElementById("evolutionChart"), {
            type: "line",
            data: {
                labels: evo.map(r => r.x),
                datasets: [{
                    label: "Findings Over Time",
                    data: evo.map(r => r.y),
                    borderColor: "rgba(255,99,132,1)",
                    fill: false
                }]
            }
        });
    });
}

// Bootstrapping
(async () => {
    const conn = await initDuckDB();
    await updateStats(conn);
    await renderCharts(conn);
    await fillTable(conn);
    await populateDropdowns(conn);
    setupEvolution(conn);
})();

