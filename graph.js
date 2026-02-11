const svg = d3.select("#networkSVG");
const histSVG = d3.select("#histSVG");
const logSVG = d3.select("#logSVG");
const tooltip = d3.select("#tooltip");

const container = svg.append("g");

svg.call(
  d3.zoom().on("zoom", (event) => {
    container.attr("transform", event.transform);
  })
);

// Populate dropdown
d3.json("networks.json").then(files => {
  d3.select("#networkSelect")
    .selectAll("option")
    .data(files)
    .enter()
    .append("option")
    .attr("value", d => d)
    .text(d => d.replace(".gml",""));
});

document.getElementById("loadBtn")
  .addEventListener("click", () => {
    const file = document.getElementById("networkSelect").value;
    loadGML("networks/" + file);
  });

document.getElementById("toggleProperties")
  .addEventListener("click", () => {
    document.getElementById("propertiesPanel")
      .classList.toggle("open");
  });

function loadGML(path) {

  const selectedFile = document.getElementById("networkSelect").value;

  d3.text(path).then(text => {

    const graph = parseGML(text);

    computeProperties(graph);
    drawGraph(graph);
    drawDegreePlots(graph);

    // Load metadata
    d3.json("network-metadata.json").then(meta => {

      if (meta[selectedFile]) {

        document.getElementById("description").innerHTML = `
          <h3>Description & Citations</h3>
          <p><strong>Description:</strong><br>
          ${meta[selectedFile].description}</p>
          <p><strong>Citation:</strong><br>
          ${meta[selectedFile].citation}</p>
        `;

      } else {

        document.getElementById("description").innerHTML = `
          <h3>Description & Citations</h3>
          <p>No metadata found for <strong>${selectedFile}</strong></p>
        `;

      }

    }).catch(err => {
      console.error("Metadata failed to load:", err);
    });

  });
}

function parseGML(text) {
  const nodes = [];
  const links = [];

  const nodeBlocks = text.match(/node\s*\[[^\]]*\]/g) || [];
  const edgeBlocks = text.match(/edge\s*\[[^\]]*\]/g) || [];

  nodeBlocks.forEach(block => {
    const id = block.match(/id\s+(\d+)/);
    if (id) nodes.push({ id: id[1] });
  });

  edgeBlocks.forEach(block => {
    const s = block.match(/source\s+(\d+)/);
    const t = block.match(/target\s+(\d+)/);
    if (s && t) links.push({ source: s[1], target: t[1] });
  });

  return { nodes, links };
}

/* -------- Tabulated Properties -------- */
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

  let table = "<table>";
  table += "<tr><th>#</th><th>Metric</th><th>Value</th></tr>";

  metrics.forEach((row,i)=>{
    table += `<tr>
      <td>${i+1}</td>
      <td title="Network metric">${row[0]}</td>
      <td>${row[1]}</td>
    </tr>`;
  });

  table += "</table>";

  document.getElementById("propertiesContent").innerHTML = table;
}

/* -------- Graph with Click Neighbors -------- */
function drawGraph(graph){

  container.selectAll("*").remove();

  const width = document.getElementById("graph").clientWidth;
  const height = document.getElementById("graph").clientHeight;

  const degree = {};
  graph.nodes.forEach(n=>degree[n.id]=0);
  graph.links.forEach(l=>{
    degree[l.source]++;
    degree[l.target]++;
  });
  graph.nodes.forEach(n=>n.degree=degree[n.id]);

  const adjacency = {};
  graph.links.forEach(l=>{
    adjacency[l.source+"-"+l.target]=true;
    adjacency[l.target+"-"+l.source]=true;
  });

  const maxDegree = d3.max(graph.nodes,d=>d.degree);

  const sizeScale = d3.scaleSqrt()
    .domain([0,maxDegree])
    .range([4,18]);

  const colorScale = d3.scaleSequential(d3.interpolateBlues)
    .domain([0,maxDegree]);

  const simulation = d3.forceSimulation(graph.nodes)
    .force("link", d3.forceLink(graph.links)
      .id(d=>d.id)
      .distance(60))
    .force("charge", d3.forceManyBody().strength(-200))
    .force("collision",
      d3.forceCollide().radius(d=>sizeScale(d.degree)+2))
    .force("center", d3.forceCenter(width/2,height/2));

  const link = container.selectAll("line")
    .data(graph.links)
    .enter()
    .append("line");

  const node = container.selectAll("circle")
    .data(graph.nodes)
    .enter()
    .append("circle")
    .attr("r",d=>sizeScale(d.degree))
    .attr("fill",d=>colorScale(d.degree))
    .on("mouseover",(event,d)=>{
      tooltip.style("display","block")
        .html(`Node: ${d.id}<br>Degree: ${d.degree}`);
    })
    .on("mousemove",(event)=>{
      tooltip.style("left",event.pageX+10+"px")
             .style("top",event.pageY+10+"px");
    })
    .on("mouseout",()=>{
      tooltip.style("display","none");
    })
    .on("click",(event,d)=>{
      node.style("opacity",o =>
        adjacency[d.id+"-"+o.id] || d.id===o.id ? 1 : 0.1);

      link.style("stroke-opacity",o =>
        o.source.id===d.id || o.target.id===d.id ? 1 : 0.1);
    })
    .call(d3.drag()
      .on("start",(event,d)=>{
        if(!event.active) simulation.alphaTarget(0.3).restart();
        d.fx=d.x; d.fy=d.y;
      })
      .on("drag",(event,d)=>{
        d.fx=event.x; d.fy=event.y;
      })
      .on("end",(event,d)=>{
        if(!event.active) simulation.alphaTarget(0);
        d.fx=null; d.fy=null;
      }));

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

/* -------- Python-style Plots -------- */
function drawDegreePlots(graph){

  histSVG.selectAll("*").remove();
  logSVG.selectAll("*").remove();

  const degrees = graph.nodes.map(d=>d.degree);
  const width = document.getElementById("histogram").clientWidth;
  const height = document.getElementById("histogram").clientHeight;

  const margin = {top:30,right:20,bottom:40,left:50};

  const x = d3.scaleLinear()
    .domain([0,d3.max(degrees)])
    .range([margin.left,width-margin.right]);

  const bins = d3.bin()(degrees);

  const y = d3.scaleLinear()
    .domain([0,d3.max(bins,d=>d.length)])
    .range([height-margin.bottom,margin.top]);

  histSVG.append("text")
    .attr("x",width/2)
    .attr("y",20)
    .attr("text-anchor","middle")
    .attr("font-weight","bold")
    .text("Degree Distribution");

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
