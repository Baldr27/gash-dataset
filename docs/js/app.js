let allData = [];
let filteredData = [];
let currentPage = 1;
let rowsPerPage = 10;

async function loadData() {
    try {
        const findingsRes = await fetch('./data/findings.json');
        const findings = await findingsRes.json();

        const metadataRes = await fetch('./data/workflow_metadata.json');
        const metadata = await metadataRes.json();

        return combineData(metadata, processFindings(findings));
    } catch (err) {
        console.error(err);
        return [];
    }
}

function processFindings(findings) {
    const counts = {};
    findings.forEach(f => {
        const key = `${f.repo_name}|${f.workflow_name}`;
        counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
}

function combineData(metadata, findingsCounts) {
    return metadata.map(item => {
        const key = `${item.repo_name}|${item.workflow_name}`;
        const count = findingsCounts[key] || 0;
        let steps = 0;
        try {
            const stepsData = JSON.parse(item.steps_per_job);
            const vals = Object.values(stepsData);
            if (vals.length > 0) steps = vals.reduce((a,b)=>a+b,0)/vals.length;
        } catch {}
        return {
            repository: item.repo_name,
            workflow: item.workflow_name,
            line_count: item.line_count,
            jobs: item.num_jobs,
            steps_per_job: steps.toFixed(1),
            findings: count,
            findings_per_line: item.line_count ? (count / item.line_count).toFixed(4) : 0
        };
    });
}

function renderTable(data, page=currentPage, rows=rowsPerPage) {
    const container = document.getElementById("findingsTable");
    container.innerHTML = "";

    if (!data || data.length === 0) {
        container.innerHTML = '<tr><td colspan="7" class="text-center">No data available</td></tr>';
        return;
    }

    const totalPages = Math.ceil(data.length / rows);
    const start = (page-1)*rows;
    const end = Math.min(start+rows, data.length);
    const pageData = data.slice(start,end);

    pageData.forEach(row=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${row.repository}</td>
            <td>${row.workflow}</td>
            <td>${row.line_count}</td>
            <td>${row.jobs}</td>
            <td>${row.steps_per_job}</td>
            <td>${row.findings}</td>
            <td>${row.findings_per_line}</td>
        `;
        container.appendChild(tr);
    });

    document.getElementById("paginationInfo").textContent = `Showing ${start+1} to ${end} of ${data.length} entries`;
    document.getElementById("prevPage").parentElement.classList.toggle("disabled", page<=1);
    document.getElementById("nextPage").parentElement.classList.toggle("disabled", page>=totalPages);
    currentPage = page;
}

function calculateStats(data) {
    if (!data.length) return {totalFindings:0, avgLineCount:0, findingsPerLine:0};
    const totalFindings = data.reduce((s,r)=>s+(r.findings||0),0);
    const avgLineCount = data.reduce((s,r)=>s+(r.line_count||0),0)/data.length;
    const findingsPerLine = totalFindings/data.reduce((s,r)=>s+(r.line_count||0),0);
    return {totalFindings, avgLineCount, findingsPerLine};
}

function createCharts(data) {
    if (!data.length) return;

    new Chart(document.getElementById('lineCountChart'), {
        type:'scatter',
        data:{datasets:[{label:'Line Count vs Findings', data:data.map(r=>({x:r.line_count,y:r.findings})), backgroundColor:'rgba(54, 162, 235, 0.5)', borderColor:'rgba(54, 162, 235, 1)'}]},
        options:{scales:{x:{title:{display:true,text:'Line Count'}},y:{title:{display:true,text:'Findings'}}}}
    });

    new Chart(document.getElementById('jobsChart'), {
        type:'scatter',
        data:{datasets:[{label:'Jobs vs Findings', data:data.map(r=>({x:r.jobs,y:r.findings})), backgroundColor:'rgba(75, 192, 192, 0.5)', borderColor:'rgba(75, 192, 192, 1)'}]},
        options:{scales:{x:{title:{display:true,text:'Number of Jobs'}},y:{title:{display:true,text:'Findings'}}}}
    });

    new Chart(document.getElementById('stepsChart'), {
        type:'scatter',
        data:{datasets:[{label:'Steps per Job vs Findings', data:data.map(r=>({x:parseFloat(r.steps_per_job)||0,y:r.findings})), backgroundColor:'rgba(153, 102, 255, 0.5)', borderColor:'rgba(153, 102, 255, 1)'}]},
        options:{scales:{x:{title:{display:true,text:'Steps per Job'}},y:{title:{display:true,text:'Findings'}}}}
    });

    new Chart(document.getElementById('evolutionChart'), {
        type:'line',
        data:{labels:['Jan','Feb','Mar','Apr','May','Jun'], datasets:[{label:'Vulnerabilities Over Time', data:[12,19,3,5,2,3], backgroundColor:'rgba(255, 99, 132, 0.2)', borderColor:'rgba(255, 99, 132, 1)'}]},
        options:{scales:{y:{beginAtZero:true}}}
    });
}

function filterData(term) {
    if (!term) filteredData=[...allData];
    else {
        const t=term.toLowerCase();
        filteredData = allData.filter(r=>Object.values(r).some(v=>v.toString().toLowerCase().includes(t)));
    }
    renderTable(filteredData,1,rowsPerPage);
}

async function initializeApp() {
    allData = await loadData();
    filteredData = [...allData];
    renderTable(filteredData);
    const stats = calculateStats(allData);
    document.getElementById('totalFindings').textContent = stats.totalFindings.toLocaleString();
    document.getElementById('avgLineCount').textContent = Math.round(stats.avgLineCount);
    document.getElementById('findingsPerLine').textContent = stats.findingsPerLine.toFixed(4);
    createCharts(allData);

    const repoSelect = document.getElementById('repoSelect');
    [...new Set(allData.map(r=>r.repository))].forEach(repo=>{
        const option = document.createElement('option'); option.value=repo; option.textContent=repo; repoSelect.appendChild(option);
    });

    document.getElementById('rowsPerPage').addEventListener('change',e=>{rowsPerPage=parseInt(e.target.value); renderTable(filteredData,1,rowsPerPage);});
    document.getElementById('searchInput').addEventListener('input',e=>filterData(e.target.value));
    document.getElementById('prevPage').addEventListener('click',e=>{e.preventDefault(); if(currentPage>1) renderTable(filteredData,currentPage-1,rowsPerPage);});
    document.getElementById('nextPage').addEventListener('click',e=>{e.preventDefault(); const totalPages=Math.ceil(filteredData.length/rowsPerPage); if(currentPage<totalPages) renderTable(filteredData,currentPage+1,rowsPerPage);});

    setTimeout(()=>{document.getElementById('loadingOverlay').style.display='none';},1000);
}

initializeApp();

