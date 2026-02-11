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

// ---------------- Populate Dropdown ----------------
d3.json("networks.json")
  .then(files => {

    console.log("Networks loaded:", files);

    const select = d3.select("#networkSelect");

    select.selectAll("option")
      .data(files)
      .enter()
      .append("option")
      .attr("value", d => d)
      .text(d => d.replace(".gml",""));
  })
  .catch(err => {
    console.error("Failed to load networks.json:", err);
  });

// ---------------- Button Events ----------------
document.getElementById("loadBtn")
  .addEventListener("click", () => {

    const file = document.getElementById("networkSelect").value;

    if (!file) {
      alert("Please select a network.");
      return;
    }

    loadGML("networks/" + file, file);
  });

document.getElementById("toggleProperties")
  .addEventListener("click", () => {
    document.getElementById("propertiesPanel")
      .classList.toggle("open");
  });

// ---------------- Load Network ----------------
function loadGML(path, fileName) {

  d3.text(path)
    .then(text => {

      const graph = parseGML(text);

      computeProperties(graph);
      drawGraph(graph);
      drawDegreePlots(graph);
      loadMetadata(fileName);

    })
    .catch(err => {
      console.error("Failed to load GML:", err);
    });
}

// ---------------- Load Metadata ----------------
function loadMetadata(fileName) {

  d3.json("network-metadata.json")
    .then(meta => {

      if (meta[fileName]) {

        document.getElementById("description").innerHTML = `
          <h3>Description & Citations</h3>
          <p><strong>Description:</strong><br>
          ${meta[fileName].description}</p>
          <p><strong>Citation:</strong><br>
          ${meta[fileName].citation}</p>
        `;

      } else {
        document.getElementById("description").innerHTML = `
          <h3>Description & Citations</h3>
          <p>No metadata found for ${fileName}</p>
        `;
      }

    })
    .catch(err => {
      console.error("Failed to load metadata:", err);
    });
}

// ---------------- Parse GML ----------------
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
