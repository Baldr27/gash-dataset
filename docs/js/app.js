// app.js
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm";

// Helper: render a query result to an HTML table
function renderTable(arrowTable, containerId = "results") {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    const table = document.createElement("table");
    table.classList.add("data-table");

    // Header row
    const header = document.createElement("tr");
    for (let field of arrowTable.schema.fields) {
        const th = document.createElement("th");
        th.textContent = field.name;
        header.appendChild(th);
    }
    table.appendChild(header);

    // Data rows
    for (let row of arrowTable) {
        const tr = document.createElement("tr");
        for (let field of arrowTable.schema.fields) {
            const td = document.createElement("td");
            td.textContent = row[field.name];
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }

    container.appendChild(table);
}

// Initialize DuckDB in the browser
async function initDB() {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

    const worker = new Worker(bundle.mainWorker, { type: "module" });
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);

    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    return db;
}

(async () => {
    const db = await initDB();
    const conn = await db.connect();

    // Register your parquet files
    await conn.query(`
        CREATE OR REPLACE VIEW findings AS 
        SELECT * FROM read_parquet('data/findings.parquet');
    `);

    await conn.query(`
        CREATE OR REPLACE VIEW metadata AS 
        SELECT * FROM read_parquet('data/workflow_metadata.parquet');
    `);

    // Example: show first 20 rows from findings
    const result = await conn.query("SELECT * FROM findings LIMIT 20");
    renderTable(result, "results");

    console.log("DuckDB initialized, query executed.");
})();

