// docs/js/app.js
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm";
import * as arrow from "https://cdn.jsdelivr.net/npm/apache-arrow@14.0.2/+esm";

// DuckDB expects Arrow on globalThis
globalThis.Arrow = arrow;

// Render a query result into an HTML table
function renderTable(arrowTable, containerId = "findingsTable") {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    for (let row of arrowTable) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${row.repository ?? ""}</td>
            <td>${row.workflow ?? ""}</td>
            <td>${row.line_count ?? ""}</td>
            <td>${row.jobs ?? ""}</td>
            <td>${row.steps_per_job ?? ""}</td>
            <td>${row.findings ?? ""}</td>
            <td>${row.findings_per_line ?? ""}</td>
        `;
        container.appendChild(tr);
    }
}

// Initialize DuckDB in the browser
async function initDB() {
    const bundles = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(bundles);

    const worker = new Worker(bundle.mainWorker, { type: "module" });
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);

    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    return db;
}

(async () => {
    const db = await initDB();
    const conn = await db.connect();

    // Register parquet files
    await conn.query(`
        CREATE OR REPLACE VIEW findings AS
        SELECT * FROM read_parquet('data/findings.parquet');
    `);

    await conn.query(`
        CREATE OR REPLACE VIEW metadata AS
        SELECT * FROM read_parquet('data/workflow_metadata.parquet');
    `);

    // Example query
    const result = await conn.query("SELECT * FROM findings LIMIT 20");
    renderTable(result, "findingsTable");

    console.log("DuckDB initialized, query executed.");
})();

