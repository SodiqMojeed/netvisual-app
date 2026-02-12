// =============================
// GLOBAL SETUP
// =============================

const svg = d3.select("#networkSVG");
const histSVG = d3.select("#histSVG");
const logSVG = d3.select("#logSVG");
const tooltip = d3.select("body")
  .append("div")
  .style("position", "absolute")
  .style("background", "white")
  .style("padding", "6px")
  .style("border", "1px solid #ccc")
  .style("font-size", "12px")
  .style("display", "none");

const container = svg.append("g");

// Zoom
svg.call(
  d3.zoom().on("zoom", (event) => {
    container.attr("transform", event.transform);
  })
);

// =============================
// SIDEBAR TOGGLES
// =============================

document.getElementById("sidebarToggle")
  .addEventListener("click", () => {

    const sidebar = document.getElementById("sidebar");
    const button = document.getElementById("sidebarToggle");

    sidebar.classList.toggle("collapsed");

    if (sidebar.classList.contains("collapsed")) {
      button.textContent = "▶";   // collapsed state
    } else {
      button.textContent = "◀";   // expanded state
    }

    setTimeout(() => {
      if (window.currentSimulation) {
        window.currentSimulation.alpha(0.5).restart();
      }
    }, 300);
  });

document.querySelectorAll(".section-header")
  .forEach(header => {
    header.addEventListener("click", () => {

      const section = header.parentElement;
      const arrow = header.querySelector(".arrow");

      section.classList.toggle("open");

      if (section.classList.contains("open")) {
        arrow.textContent = "▼";
      } else {
        arrow.textContent = "▶";
      }
    });
  });

// =============================
// SIDEBAR RESIZE LOGIC
// =============================

const sidebar = document.getElementById("sidebar");
const resizeHandle = document.getElementById("resizeHandle");

let isResizing = false;

resizeHandle.addEventListener("mousedown", () => {
  isResizing = true;
  document.body.style.cursor = "ew-resize";
});

document.addEventListener("mousemove", (event) => {
  if (!isResizing) return;

  const newWidth = event.clientX;

  if (newWidth > 250 && newWidth < 800) {
    sidebar.style.width = newWidth + "px";
  }

  // Restart simulation so graph recenters
  if (window.currentSimulation) {
    window.currentSimulation.alpha(0.1).restart();
  }
});

document.addEventListener("mouseup", () => {
  isResizing = false;
  document.body.style.cursor = "default";
});

// =============================
// LOAD DROPDOWN
// =============================

d3.json("networks.json")
  .then(files => {
    const select = d3.select("#networkSelect");

    select.selectAll("option")
      .data(files)
      .enter()
      .append("option")
      .attr("value", d => d)
      .text(d => d.replace(".gml",""));
  })
  .catch(err => console.error("Failed to load networks.json:", err));

// =============================
// BUTTON EVENT
// =============================

document.getElementById("loadBtn")
  .addEventListener("click", () => {

    const file = document.getElementById("networkSelect").value;
    if (!file) return;

    loadGML("networks/" + file, file);
  });

// =============================
// LOAD GML
// =============================

function loadGML(path, fileName) {

  // Open sidebar sections first
  document.getElementById("propertiesSection").classList.add("open");
  document.getElementById("degreeSection").classList.add("open");
  document.getElementById("descriptionSection").classList.add("open");

  setTimeout(() => {

    d3.text(path)
      .then(text => {

        const graph = parseGML(text);

        computeProperties(graph);
        drawGraph(graph);
        drawDegreePlots(graph);
        loadMetadata(fileName);

      })
      .catch(err => console.error("Failed to load GML:", err));

  }, 200);
}

// =============================
// LOAD METADATA
// =============================

function loadMetadata(fileName) {

  d3.json("network-metadata.json")
    .then(meta => {

      if (meta[fileName]) {
        document.getElementById("description").innerHTML = `
          <p><strong>Description:</strong><br>
          ${meta[fileName].description}</p>
          <p><strong>Citation:</strong><br>
          ${meta[fileName].citation}</p>
        `;
      } else {
        document.getElementById("description").innerHTML =
          `<p>No metadata found for ${fileName}</p>`;
      }
    })
    .catch(err => console.error("Metadata failed:", err));
}

// =============================
// PARSE GML
// =============================

function parseGML(text) {

  const nodes = [];
  const links = [];

  const nodeRegex = /node\s*\[([\s\S]*?)\]/g;
  const edgeRegex = /edge\s*\[([\s\S]*?)\]/g;

  let match;

  while ((match = nodeRegex.exec(text)) !== null) {
    const idMatch = match[1].match(/id\s+("?[\w\d]+"?)/);
    if (idMatch) {
      nodes.push({ id: idMatch[1].replace(/"/g,"") });
    }
  }

  while ((match = edgeRegex.exec(text)) !== null) {
    const s = match[1].match(/source\s+("?[\w\d]+"?)/);
    const t = match[1].match(/target\s+("?[\w\d]+"?)/);
    if (s && t) {
      links.push({
        source: s[1].replace(/"/g,""),
        target: t[1].replace(/"/g,"")
      });
    }
  }

  return { nodes, links };
}

// =============================
// COMPUTE PROPERTIES
// =============================

function computeProperties(graph) {

  const n = graph.nodes.length;
  const m = graph.links.length;

  const degree = {};
  graph.nodes.forEach(n => degree[n.id] = 0);

  graph.links.forEach(l => {
    degree[l.source]++;
    degree[l.target]++;
  });

  const degrees = Object.values(degree);

  const metrics = [
    ["Nodes", n],
    ["Edges", m],
    ["Average Degree", d3.mean(degrees).toFixed(2)],
    ["Density", ((2*m)/(n*(n-1))).toFixed(4)],
    ["Max Degree", d3.max(degrees)],
    ["Min Degree", d3.min(degrees)]
  ];

  let table = "<table><tr><th>#</th><th>Metric</th><th>Value</th></tr>";

  metrics.forEach((row,i)=>{
    table += `<tr>
      <td>${i+1}</td>
      <td>${row[0]}</td>
      <td>${row[1]}</td>
    </tr>`;
  });

  table += "</table>";

  document.getElementById("propertiesContent").innerHTML = table;
}

// =============================
// DRAW GRAPH
// =============================

function drawGraph(graph) {

  container.selectAll("*").remove();

  const containerDiv = document.getElementById("graphContainer");
  const width = containerDiv.clientWidth;
  const height = containerDiv.clientHeight;

  svg.attr("width", width).attr("height", height);

  // -----------------------
  // Degree computation
  // -----------------------

  const degree = {};
  graph.nodes.forEach(n => degree[n.id] = 0);

  graph.links.forEach(l => {
    degree[l.source]++;
    degree[l.target]++;
  });

  graph.nodes.forEach(n => n.degree = degree[n.id]);

  // -----------------------
  // Adjacency map
  // -----------------------

  const adjacency = {};
  graph.links.forEach(l => {
    adjacency[l.source + "-" + l.target] = true;
    adjacency[l.target + "-" + l.source] = true;
  });

  // -----------------------
  // Scales
  // -----------------------

  const maxDegree = d3.max(graph.nodes, d => d.degree) || 1;

  const sizeScale = d3.scaleSqrt()
    .domain([0, maxDegree])
    .range([4, 18]);

  const colorScale = d3.scaleSequential(d3.interpolateBlues)
    .domain([0, maxDegree]);

  // -----------------------
  // Simulation
  // -----------------------

  const simulation = d3.forceSimulation(graph.nodes)
    .force("link", d3.forceLink(graph.links)
      .id(d => d.id)
      .distance(70))
    .force("charge", d3.forceManyBody().strength(-250))
    .force("collision",
      d3.forceCollide().radius(d => sizeScale(d.degree) + 2))
    .force("center", d3.forceCenter(width / 2, height / 2));

  window.currentSimulation = simulation;

  // -----------------------
  // Draw Links
  // -----------------------

  const link = container.append("g")
    .selectAll("line")
    .data(graph.links)
    .enter()
    .append("line")
    .attr("stroke", "#444")
    .attr("stroke-width", 1.5)
    .attr("stroke-opacity", 0.9);

  // -----------------------
  // Draw Nodes
  // -----------------------

  const node = container.append("g")
    .selectAll("circle")
    .data(graph.nodes)
    .enter()
    .append("circle")
    .attr("r", d => sizeScale(d.degree))
    .attr("fill", d => colorScale(d.degree))
    .attr("stroke", "#333")
    .attr("stroke-width", 1)
    .style("cursor", "pointer")

    // Tooltip
    .on("mouseover", (event, d) => {
      tooltip
        .style("display", "block")
        .html(`Node: ${d.id}<br>Degree: ${d.degree}`);
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY + 10) + "px");
    })
    .on("mouseout", () => {
      tooltip.style("display", "none");
    })

    // Highlight neighbors on click
    .on("click", (event, d) => {

      node.style("opacity", o =>
        adjacency[d.id + "-" + o.id] || d.id === o.id ? 1 : 0.1
      );

      link.style("stroke-opacity", o =>
        o.source.id === d.id || o.target.id === d.id ? 1 : 0.1
      );
    })

    // Drag behavior
    .call(d3.drag()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      })
    );

  // -----------------------
  // Reset highlight on background click
  // -----------------------

  svg.on("click", (event) => {
    if (event.target.tagName === "svg") {
      node.style("opacity", 1);
      link.style("stroke-opacity", 0.9);
    }
  });

  // -----------------------
  // Tick update
  // -----------------------

  simulation.on("tick", () => {

    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);
  });
}

// =============================
// DEGREE PLOTS
// =============================

function drawDegreePlots(graph){

  histSVG.selectAll("*").remove();
  logSVG.selectAll("*").remove();

  const degrees = graph.nodes.map(d => d.degree);

  const margin = {top:40, right:30, bottom:50, left:60};

  // =====================================
  // HISTOGRAM (TOP PLOT)
  // =====================================

  const width1 = histSVG.node().clientWidth;
  const height1 = histSVG.node().clientHeight;

  const x1 = d3.scaleLinear()
    .domain([0, d3.max(degrees)])
    .range([margin.left, width1 - margin.right]);

  const bins = d3.bin()(degrees);

  const y1 = d3.scaleLinear()
    .domain([0, d3.max(bins, d=>d.length)])
    .range([height1 - margin.bottom, margin.top]);

  histSVG.append("text")
    .attr("x", width1/2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("font-weight", "bold")
    .attr("font-size", "12px")
    .text("Degree Distribution");

  histSVG.append("g")
    .attr("transform",`translate(0,${height1-margin.bottom})`)
    .call(d3.axisBottom(x1));

  histSVG.append("g")
    .attr("transform",`translate(${margin.left},0)`)
    .call(d3.axisLeft(y1));

  histSVG.selectAll("rect")
    .data(bins)
    .enter()
    .append("rect")
    .attr("x",d=>x1(d.x0))
    .attr("y",d=>y1(d.length))
    .attr("width",d=>x1(d.x1)-x1(d.x0)-2)
    .attr("height",d=>height1-margin.bottom-y1(d.length))
    .attr("fill","#4682b4");

  // X-axis label
  histSVG.append("text")
    .attr("x", width1 / 2)
    .attr("y", height1 - 10)
    .attr("text-anchor", "middle")
    .attr("font-size", "12px")
    .text("Degree (k)");

  // Y-axis label
  histSVG.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height1 / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("font-size", "12px")
    .text("Frequency");


  // =====================================
  // LOG-LOG POWER LAW (BOTTOM PLOT)
  // =====================================

  const width2 = logSVG.node().clientWidth;
  const height2 = logSVG.node().clientHeight;

  const freq = {};
  degrees.forEach(k=>{
    if (k > 0) freq[k] = (freq[k] || 0) + 1;
  });

  const data = Object.entries(freq)
    .map(([k,v])=>({k:+k, count:v}))
    .filter(d=>d.k>0 && d.count>0);

  const logData = data.map(d=>({
    x: Math.log10(d.k),
    y: Math.log10(d.count)
  }));

  const x2 = d3.scaleLinear()
    .domain(d3.extent(logData,d=>d.x))
    .range([margin.left,width2-margin.right]);

  const y2 = d3.scaleLinear()
    .domain(d3.extent(logData,d=>d.y))
    .range([height2-margin.bottom,margin.top]);

  logSVG.append("text")
    .attr("x", width2/2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("font-weight", "bold")
    .attr("font-size", "12px")
    .text("Degree Distribution on a Log-Log Scale");

  logSVG.append("g")
    .attr("transform",`translate(0,${height2-margin.bottom})`)
    .call(d3.axisBottom(x2)
      .tickFormat(d=>`10^${d.toFixed(1)}`));

  logSVG.append("g")
    .attr("transform",`translate(${margin.left},0)`)
    .call(d3.axisLeft(y2)
      .tickFormat(d=>`10^${d.toFixed(1)}`));

  // Scatter
  logSVG.selectAll("circle")
    .data(logData)
    .enter()
    .append("circle")
    .attr("cx",d=>x2(d.x))
    .attr("cy",d=>y2(d.y))
    .attr("r",4)
    .attr("fill","#2c3e50");

  // Linear regression in log space
  const n = logData.length;
  const sumX = d3.sum(logData,d=>d.x);
  const sumY = d3.sum(logData,d=>d.y);
  const sumXY = d3.sum(logData,d=>d.x*d.y);
  const sumX2 = d3.sum(logData,d=>d.x*d.x);

  const slope = (n*sumXY - sumX*sumY) /
                (n*sumX2 - sumX*sumX);

  const intercept = (sumY - slope*sumX) / n;

  const xMin = d3.min(logData,d=>d.x);
  const xMax = d3.max(logData,d=>d.x);

  const lineData = [
    {x:xMin, y:slope*xMin + intercept},
    {x:xMax, y:slope*xMax + intercept}
  ];

  logSVG.append("line")
    .attr("x1",x2(lineData[0].x))
    .attr("y1",y2(lineData[0].y))
    .attr("x2",x2(lineData[1].x))
    .attr("y2",y2(lineData[1].y))
    .attr("stroke","red")
    .attr("stroke-width",2);

  const gamma = -slope;

  logSVG.append("text")
    .attr("x",width2-140)
    .attr("y",margin.top+20)
    .attr("fill","red")
    .attr("font-size","12px")
    .text(`γ ≈ ${gamma.toFixed(2)}`);

  // ==========================
  // AXIS LABELS (LOG-LOG)
  // ==========================

  // X-axis label
  logSVG.append("text")
    .attr("x", width2 / 2)
    .attr("y", height2 - 8)
    .attr("text-anchor", "middle")
    .attr("font-size", "12px")
    .text("log₁₀(k)");

  // Y-axis label
  logSVG.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height2 / 2)
    .attr("y", 18)
    .attr("text-anchor", "middle")
    .attr("font-size", "12px")
    .text("log₁₀(P(k))");
}
