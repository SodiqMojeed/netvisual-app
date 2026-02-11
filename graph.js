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
    document.getElementById("sidebar")
      .classList.toggle("collapsed");

    setTimeout(() => {
      if (window.currentSimulation) {
        window.currentSimulation.alpha(0.5).restart();
      }
    }, 300);
  });

document.querySelectorAll(".section-header")
  .forEach(header => {
    header.addEventListener("click", () => {
      header.parentElement.classList.toggle("open");
    });
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

  const degree = {};
  graph.nodes.forEach(n => degree[n.id] = 0);

  graph.links.forEach(l => {
    degree[l.source]++;
    degree[l.target]++;
  });

  graph.nodes.forEach(n => n.degree = degree[n.id]);

  const maxDegree = d3.max(graph.nodes, d => d.degree) || 1;

  const sizeScale = d3.scaleSqrt()
    .domain([0,maxDegree])
    .range([4,18]);

  const colorScale = d3.scaleSequential(d3.interpolateBlues)
    .domain([0,maxDegree]);

  const simulation = d3.forceSimulation(graph.nodes)
    .force("link", d3.forceLink(graph.links)
      .id(d => d.id)
      .distance(70))
    .force("charge", d3.forceManyBody().strength(-250))
    .force("center", d3.forceCenter(width/2,height/2));

  window.currentSimulation = simulation;

  const link = container.selectAll("line")
    .data(graph.links)
    .enter()
    .append("line");

  const node = container.selectAll("circle")
    .data(graph.nodes)
    .enter()
    .append("circle")
    .attr("r", d => sizeScale(d.degree))
    .attr("fill", d => colorScale(d.degree))
    .on("mouseover", (event,d)=>{
      tooltip.style("display","block")
        .html(`Node: ${d.id}<br>Degree: ${d.degree}`);
    })
    .on("mousemove",(event)=>{
      tooltip.style("left",(event.pageX+10)+"px")
             .style("top",(event.pageY+10)+"px");
    })
    .on("mouseout",()=>{
      tooltip.style("display","none");
    });

  simulation.on("tick",()=>{
    link
      .attr("x1",d=>d.source.x)
      .attr("y1",d=>d.source.y)
      .attr("x2",d=>d.target.x)
      .attr("y2",d=>d.target.y);

    node
      .attr("cx",d=>d.x)
      .attr("cy",d=>d.y);
  });
}

// =============================
// DEGREE PLOTS
// =============================

function drawDegreePlots(graph){

  histSVG.selectAll("*").remove();
  logSVG.selectAll("*").remove();

  const degrees = graph.nodes.map(d=>d.degree);
  const width = histSVG.node().clientWidth;
  const height = histSVG.node().clientHeight;

  const margin = {top:30,right:20,bottom:40,left:50};

  const x = d3.scaleLinear()
    .domain([0,d3.max(degrees)])
    .range([margin.left,width-margin.right]);

  const bins = d3.bin()(degrees);

  const y = d3.scaleLinear()
    .domain([0,d3.max(bins,d=>d.length)])
    .range([height-margin.bottom,margin.top]);

  histSVG.append("g")
    .attr("transform",`translate(0,${height-margin.bottom})`)
    .call(d3.axisBottom(x));

  histSVG.append("g")
    .attr("transform",`translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  histSVG.selectAll("rect")
    .data(bins)
    .enter()
    .append("rect")
    .attr("x",d=>x(d.x0))
    .attr("y",d=>y(d.length))
    .attr("width",d=>x(d.x1)-x(d.x0)-2)
    .attr("height",d=>height-margin.bottom-y(d.length))
    .attr("fill","#4682b4");
}
