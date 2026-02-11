const svg = d3.select("#graph svg");
const degreeSVG = d3.select("#degreeSVG");
const tooltip = d3.select("#tooltip");

const width = document.getElementById("graph").clientWidth;
const height = document.getElementById("graph").clientHeight;

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
    loadGML(`networks/${file}`);
  });

function loadGML(path) {
  d3.text(path).then(text => {
    const graph = parseGML(text);
    drawGraph(graph);
    drawDegreeDistribution(graph);
  });
}

// Simple GML parser
function parseGML(text) {
  const nodes = [];
  const links = [];

  const nodeRegex = /node\s*\[(.*?)\]/gs;
  const edgeRegex = /edge\s*\[(.*?)\]/gs;

  let match;

  while ((match = nodeRegex.exec(text)) !== null) {
    const idMatch = /id\s+(\d+)/.exec(match[1]);
    if (idMatch) nodes.push({ id: idMatch[1] });
  }

  while ((match = edgeRegex.exec(text)) !== null) {
    const sourceMatch = /source\s+(\d+)/.exec(match[1]);
    const targetMatch = /target\s+(\d+)/.exec(match[1]);
    if (sourceMatch && targetMatch) {
      links.push({
        source: sourceMatch[1],
        target: targetMatch[1]
      });
    }
  }

  return { nodes, links };
}

function drawGraph(graph) {

  container.selectAll("*").remove();

  // Compute degrees
  const degree = {};
  graph.nodes.forEach(n => degree[n.id] = 0);

  graph.links.forEach(l => {
    degree[l.source]++;
    degree[l.target]++;
  });

  graph.nodes.forEach(n => n.degree = degree[n.id]);

  const maxDegree = d3.max(graph.nodes, d => d.degree);

  const logScale = document.getElementById("logScaleToggle").checked;

  const degreeTransform = d =>
    logScale ? Math.log(d.degree + 1) : d.degree;

  const maxTransformed =
    d3.max(graph.nodes, d => degreeTransform(d));

  const sizeScale = d3.scaleSqrt()
    .domain([0, maxTransformed])
    .range([4, 22]);

  const colorScale = d3.scaleSequential(d3.interpolatePlasma)
    .domain([0, maxTransformed]);

  const adjacency = {};
  graph.links.forEach(l => {
    adjacency[`${l.source}-${l.target}`] = true;
    adjacency[`${l.target}-${l.source}`] = true;
  });

  function isNeighbor(a, b) {
    return adjacency[`${a.id}-${b.id}`] || a.id === b.id;
  }

  const simulation = d3.forceSimulation(graph.nodes)
    .force("link", d3.forceLink(graph.links)
        .id(d => d.id)
        .distance(graph.nodes.length < 50 ? 120 : 60))
    .force("charge", d3.forceManyBody().strength(-200))
    .force("collision",
        d3.forceCollide().radius(d =>
          sizeScale(degreeTransform(d)) + 2))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .alphaDecay(0.05);

  const link = container.append("g")
    .selectAll("line")
    .data(graph.links)
    .enter()
    .append("line");

  const node = container.append("g")
    .selectAll("circle")
    .data(graph.nodes)
    .enter()
    .append("circle")
    .attr("r", d => sizeScale(degreeTransform(d)))
    .attr("fill", d => colorScale(degreeTransform(d)))
    .on("mouseover", (event, d) => {

      tooltip.style("display","block")
        .html(`Node: ${d.id}<br>Degree: ${d.degree}`);

      node.style("opacity", o =>
        isNeighbor(d, o) ? 1 : 0.1);

      link.style("stroke-opacity", o =>
        o.source.id === d.id || o.target.id === d.id ? 0.8 : 0.05);
    })
    .on("mousemove", (event) => {
      tooltip.style("left", (event.pageX + 10) + "px")
             .style("top", (event.pageY + 10) + "px");
    })
    .on("mouseout", () => {
      tooltip.style("display","none");
      node.style("opacity",1);
      link.style("stroke-opacity",0.2);
    })
    .call(d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended)
    );

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

  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
}

// Degree Distribution Panel
function drawDegreeDistribution(graph) {

  degreeSVG.selectAll("*").remove();

  const degrees = graph.nodes.map(d => d.degree);

  const width = document.getElementById("degreePanel").clientWidth;
  const height = document.getElementById("degreePanel").clientHeight;

  const x = d3.scaleLinear()
    .domain([0, d3.max(degrees)])
    .range([40, width - 20]);

  const bins = d3.bin()(degrees);

  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length)])
    .range([height - 30, 20]);

  degreeSVG.selectAll("rect")
    .data(bins)
    .enter()
    .append("rect")
    .attr("x", d => x(d.x0))
    .attr("y", d => y(d.length))
    .attr("width", d => x(d.x1) - x(d.x0) - 2)
    .attr("height", d => height - 30 - y(d.length))
    .attr("fill", "steelblue")
    .attr("opacity",0.8);
}
