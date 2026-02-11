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
  d3.text(path).then(text => {
    const graph = parseGML(text);
    computeProperties(graph);
    drawGraph(graph);
    drawDegreePlots(graph);
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
  const avgDegree = d3.mean(degrees);
  const maxDegree = d3.max(degrees);
  const minDegree = d3.min(degrees);
  const density = (2 * m) / (n * (n - 1));

  document.getElementById("propertiesContent").innerHTML = `
    <strong>Nodes:</strong> ${n}<br>
    <strong>Edges:</strong> ${m}<br>
    <strong>Average Degree:</strong> ${avgDegree.toFixed(2)}<br>
    <strong>Density:</strong> ${density.toFixed(4)}<br>
    <strong>Max Degree:</strong> ${maxDegree}<br>
    <strong>Min Degree:</strong> ${minDegree}
  `;
}

function drawGraph(graph) {

  container.selectAll("*").remove();

  const width = document.getElementById("graph").clientWidth;
  const height = document.getElementById("graph").clientHeight;

  const degree = {};
  graph.nodes.forEach(n => degree[n.id] = 0);
  graph.links.forEach(l => {
    degree[l.source]++;
    degree[l.target]++;
  });
  graph.nodes.forEach(n => n.degree = degree[n.id]);

  const maxDegree = d3.max(graph.nodes, d => d.degree);

  const sizeScale = d3.scaleSqrt()
    .domain([0, maxDegree])
    .range([4, 18]);

  const colorScale = d3.scaleSequential(d3.interpolateBlues)
    .domain([0, maxDegree]);

  const simulation = d3.forceSimulation(graph.nodes)
    .force("link", d3.forceLink(graph.links)
      .id(d => d.id)
      .distance(60))
    .force("charge", d3.forceManyBody().strength(-200))
    .force("collision",
      d3.forceCollide().radius(d => sizeScale(d.degree) + 2))
    .force("center", d3.forceCenter(width / 2, height / 2));

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

function drawDegreePlots(graph){

  histSVG.selectAll("*").remove();
  logSVG.selectAll("*").remove();

  const degrees = graph.nodes.map(d=>d.degree);
  const width = document.getElementById("histogram").clientWidth;
  const height = document.getElementById("histogram").clientHeight;

  const bins = d3.bin()(degrees);

  const x = d3.scaleLinear()
    .domain([0,d3.max(degrees)])
    .range([50,width-20]);

  const y = d3.scaleLinear()
    .domain([0,d3.max(bins,d=>d.length)])
    .range([height-40,20]);

  // Histogram Title
  histSVG.append("text")
    .attr("x", width/2)
    .attr("y", 15)
    .attr("text-anchor","middle")
    .attr("font-weight","bold")
    .text("Degree Distribution");

  histSVG.selectAll("rect")
    .data(bins)
    .enter()
    .append("rect")
    .attr("x",d=>x(d.x0))
    .attr("y",d=>y(d.length))
    .attr("width",d=>x(d.x1)-x(d.x0)-2)
    .attr("height",d=>height-40-y(d.length))
    .attr("fill","#4682b4");

  // Axis labels
  histSVG.append("text")
    .attr("x", width/2)
    .attr("y", height-5)
    .attr("text-anchor","middle")
    .text("Degree");

  histSVG.append("text")
    .attr("transform","rotate(-90)")
    .attr("x",-height/2)
    .attr("y",15)
    .attr("text-anchor","middle")
    .text("Frequency");

  // Log-Log Plot
  const freq = {};
  degrees.forEach(k=>freq[k]=(freq[k]||0)+1);

  const data = Object.entries(freq)
    .map(([k,v])=>({k:+k,v}));

  const logX = d3.scaleLog()
    .domain([1,d3.max(data,d=>d.k)])
    .range([50,width-20]);

  const logY = d3.scaleLog()
    .domain([1,d3.max(data,d=>d.v)])
    .range([height-40,20]);

  logSVG.append("text")
    .attr("x", width/2)
    .attr("y", 15)
    .attr("text-anchor","middle")
    .attr("font-weight","bold")
    .text("Log-Log Degree Plot");

  logSVG.selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx",d=>logX(d.k))
    .attr("cy",d=>logY(d.v))
    .attr("r",3)
    .attr("fill","black");

  logSVG.append("text")
    .attr("x", width/2)
    .attr("y", height-5)
    .attr("text-anchor","middle")
    .text("Degree (log)");

  logSVG.append("text")
    .attr("transform","rotate(-90)")
    .attr("x",-height/2)
    .attr("y",15)
    .attr("text-anchor","middle")
    .text("Frequency (log)");
}
