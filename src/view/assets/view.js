(function () {
  var nodes = JSON.parse(document.getElementById("brain-data").textContent);
  var kindConfigs = JSON.parse(document.getElementById("kind-data").textContent);
  var launchInfo = JSON.parse(document.getElementById("launch-data").textContent);
  var kindConfigByName = new Map(kindConfigs.map(function (item) { return [item.kind, item]; }));
  var nodeById = new Map(nodes.map(function (node) { return [node.id, node]; }));
  var degreeById = buildDegreeMap(nodes);
  var clusterModel = buildClusterModel(nodes, degreeById);
  var clusterNodeGroups = nodesByCluster(nodes, clusterModel);
  var clusterRadii = clusterLayoutRadii(clusterModel.clusters, clusterNodeGroups, clusterModel.adjacency);
  var layoutById = buildGalaxyLayout(nodes, degreeById, clusterModel, clusterNodeGroups, clusterRadii);
  var selectedId = hashNodeId() || mostConnectedNodeId(nodes, degreeById);
  var graphFocusActive = Boolean(selectedId);
  var query = "";
  var graphWrap = document.querySelector(".graph-wrap");
  var detailPanel = document.querySelector(".detail");
  var nodeList = document.getElementById("node-list");
  var graph = document.getElementById("graph");
  var graphFocus = document.getElementById("graph-focus");
  var detail = document.getElementById("detail");
  var relations = document.getElementById("relations");
  var content = document.getElementById("content");
  var contentOpen = document.getElementById("content-open");
  var search = document.getElementById("search");
  var searchToggle = document.getElementById("search-toggle");
  var launchToggle = document.getElementById("launch-toggle");
  var launchPopover = document.getElementById("launch-popover");
  var launchClose = document.getElementById("launch-close");
  var launchMcpUrl = document.getElementById("launch-mcp-url");
  var launchViewUrl = document.getElementById("launch-view-url");
  var searchClose = document.getElementById("search-close");
  var searchPopover = document.getElementById("search-popover");
  var contentPopover = document.getElementById("content-popover");
  var contentClose = document.getElementById("content-close");
  var contentDetail = document.getElementById("content-detail");
  var zoomIn = document.getElementById("zoom-in");
  var zoomOut = document.getElementById("zoom-out");
  var lastGraphCenterKey = "";
  var userZoom = 1;
  var pinchStartDistance = 0;
  var pinchStartZoom = 1;

  function updateZoomButtons() {
    if (zoomIn) zoomIn.disabled = userZoom >= 2.25;
    if (zoomOut) zoomOut.disabled = userZoom <= 0.55;
  }
  updateZoomButtons();

  searchToggle.addEventListener("click", function () {
    openSearch();
  });

  launchToggle.addEventListener("click", function () {
    openLaunch();
  });

  launchClose.addEventListener("click", function () {
    closeLaunch();
  });

  launchPopover.addEventListener("click", function (event) {
    if (event.target === launchPopover) closeLaunch();
  });

  searchClose.addEventListener("click", function () {
    closeSearch();
  });

  searchPopover.addEventListener("click", function (event) {
    if (event.target === searchPopover) closeSearch();
  });

  contentClose.addEventListener("click", function () {
    closeContent();
  });

  contentOpen.addEventListener("click", function () {
    openContent();
  });

  zoomIn.addEventListener("click", function () {
    var rect = graph.getBoundingClientRect();
    fastUpdateUserZoom(userZoom * 1.18, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });

  zoomOut.addEventListener("click", function () {
    var rect = graph.getBoundingClientRect();
    fastUpdateUserZoom(userZoom / 1.18, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });

  var pinchStartSvgWidth = 0;
  var pinchStartSvgHeight = 0;
  var pinchStartSvgX = 0;
  var pinchStartSvgY = 0;
  var pinchPointerX = 0;
  var pinchPointerY = 0;

  graph.addEventListener("touchstart", function (event) {
    if (event.touches.length !== 2) return;
    pinchStartDistance = touchDistance(event.touches[0], event.touches[1]);
    pinchStartZoom = userZoom;
    
    var svg = graph.querySelector("svg");
    if (svg) {
      pinchStartSvgWidth = parseFloat(svg.getAttribute("width"));
      pinchStartSvgHeight = parseFloat(svg.getAttribute("height"));
    }
    
    var rect = graph.getBoundingClientRect();
    var cx = (event.touches[0].clientX + event.touches[1].clientX) / 2;
    var cy = (event.touches[0].clientY + event.touches[1].clientY) / 2;
    
    pinchPointerX = cx - rect.left;
    pinchPointerY = cy - rect.top;
    
    pinchStartSvgX = graph.scrollLeft + pinchPointerX;
    pinchStartSvgY = graph.scrollTop + pinchPointerY;
  }, { passive: true });

  graph.addEventListener("touchmove", function (event) {
    if (event.touches.length !== 2 || !pinchStartDistance) return;
    event.preventDefault();
    var distance = touchDistance(event.touches[0], event.touches[1]);
    var newZoom = clamp(pinchStartZoom * distance / pinchStartDistance, 0.55, 2.25);
    if (newZoom === userZoom) return;
    userZoom = newZoom;
    
    var ratio = userZoom / pinchStartZoom;
    var svg = graph.querySelector("svg");
    if (svg && pinchStartSvgWidth) {
      svg.setAttribute("width", Math.ceil(pinchStartSvgWidth * ratio));
      svg.setAttribute("height", Math.ceil(pinchStartSvgHeight * ratio));
    }
    
    graph.scrollLeft = (pinchStartSvgX * ratio) - pinchPointerX;
    graph.scrollTop = (pinchStartSvgY * ratio) - pinchPointerY;
    
    lastGraphCenterKey = "zoomed";
    updateZoomButtons();
  }, { passive: false });

  graph.addEventListener("touchend", function (event) {
    if (event.touches.length >= 2) return;
    pinchStartDistance = 0;
  });

  graphFocus.addEventListener("click", function () {
    if (!graphFocusActive || !selectedId) return;
    openContent();
  });

  graphFocus.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (!graphFocusActive || !selectedId) return;
    openContent();
  });

  contentPopover.addEventListener("click", function (event) {
    if (event.target === contentPopover) closeContent();
  });

  search.addEventListener("input", function (event) {
    query = normalizeSearchText(event.target.value.trim());
    render();
  });

  graph.addEventListener("click", function (event) {
    if (event.target.closest("[data-node-id]")) return;
    if (!graphFocusActive && !selectedId) return;
    selectedId = "";
    graphFocusActive = false;
    clearNodeHash();
    closeContent();
    render();
  });

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-node-id]");
    if (!button) return;
    selectedId = button.getAttribute("data-node-id");
    graphFocusActive = true;
    updateNodeHash(selectedId);
    if (searchPopover.contains(button)) {
      query = "";
      search.value = "";
      closeSearch();
    }
    if (!graph.contains(button)) {
      graph.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    render();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (contentPopover.classList.contains("is-open")) {
      closeContent();
      return;
    }
    if (searchPopover.classList.contains("is-open")) {
      closeSearch();
      return;
    }
    if (launchPopover.classList.contains("is-open")) {
      closeLaunch();
    }
  });

  window.addEventListener("hashchange", function () {
    var nodeId = hashNodeId();
    if (!nodeId || !nodeById.has(nodeId)) return;
    selectedId = nodeId;
    graphFocusActive = true;
    query = "";
    search.value = "";
    render();
  });

  function filteredNodes() {
    if (!query) return nodes;
    return nodes.map(function (node, index) {
      return { node: node, index: index, rank: searchRank(node) };
    }).filter(function (match) {
      return match.rank < Infinity;
    }).sort(function (left, right) {
      return left.rank - right.rank ||
        left.node.title.localeCompare(right.node.title) ||
        left.index - right.index;
    }).map(function (match) {
      return match.node;
    });
  }

  function searchRank(node) {
    var title = normalizeSearchText(node.title);
    if (title === query) return 0;
    if (title.includes(query)) return 1;

    var contentText = normalizeSearchText([
      node.summary,
      (node.content || []).join(" ")
    ].join(" "));
    if (contentText.includes(query)) return 2;

    return Infinity;
  }

  function render() {
    var matches = filteredNodes();
    var visible = nodes;
    if (selectedId && !nodeById.has(selectedId)) {
      selectedId = "";
      graphFocusActive = false;
      clearNodeHash();
    }
    renderList(query ? matches : visible);
    renderGraph(visible);
    renderGraphFocus();
    renderDetail();
    syncDetailHeight();
  }

  function renderList(visible) {
    if (visible.length === 0) {
      nodeList.innerHTML = '<p class="empty">No node matches the filter.</p>';
      return;
    }
    nodeList.innerHTML = visible.map(function (node) {
      var colors = kindColors(node.kind);
      return '<button class="node-button" type="button" data-node-id="' + escapeAttr(node.id) + '">' +
        '<span class="node-title"><span class="node-title-main">' + escapeHtml(node.title) + '</span><!--' +
        '--><span class="node-title-kind"><span class="tag" style="--tag-fill: ' + colors.fill + '; --tag-stroke: ' + colors.stroke + ';">' + escapeHtml(node.kind) + '</span></span></span>' +
        (node.summary ? '<p>' + escapeHtml(node.summary) + '</p>' : "") +
        '<span class="node-meta">' + escapeHtml(formatDate(node.dates && node.dates.updated_at || node.dates && node.dates.created_at)) + '</span>' +
      '</button>';
    }).join("");
  }

  function renderGraph(visible) {
    if (visible.length === 0) {
      graph.innerHTML = '<p class="empty" style="margin: 1em;">No map to display.</p>';
      return;
    }
    var isSmallScreen = window.matchMedia("(max-width: 40em)").matches;
    var viewportWidth = isSmallScreen ? Math.max(320, graph.clientWidth || 320) : Math.max(640, graph.clientWidth || 640);
    var viewportHeight = isSmallScreen ? 360 : 720;
    var visibleIds = new Set(visible.map(function (node) { return node.id; }));
    var fitted = fitLayoutToScrollableCanvas(visible, viewportWidth, viewportHeight);
    var width = fitted.width;
    var height = fitted.height;
    var zoom = round(fitted.zoom * userZoom);
    var displayWidth = Math.ceil(width * zoom);
    var displayHeight = Math.ceil(height * zoom);
    var positions = fitted.positions;
    var hubLabels = hubLabelIds(visible);
    var selectedNode = graphFocusActive ? nodeById.get(selectedId) : null;
    var selectedColors = kindColors(selectedNode && selectedNode.kind);
    var selectedNeighborIds = graphFocusActive && selectedNode ? relatedNodeIds(selectedNode, visibleIds) : new Set();
    var edges = graphFocusActive && selectedNode
      ? renderFocusedEdges(visible, visibleIds, positions, selectedColors)
      : "";

    var graphNodes = visible.map(function (node) {
      var point = positions.get(node.id) || { x: width / 2, y: height / 2 };
      var active = graphFocusActive && node.id === selectedId;
      var neighbor = graphFocusActive && !active && selectedNeighborIds.has(node.id);
      var degree = degreeById.get(node.id) || 0;
      var isolated = degree === 0;
      var classes = "graph-node" + (active ? " is-active" : "") + (neighbor ? " is-neighbor" : "") + (isolated ? " is-isolated" : "") + (graphFocusActive && !active && !neighbor ? " is-far" : "");
      var radius = nodeRadius(node, active);
      var colors = kindColors(node.kind);
      var clusterHub = clusterModel.clusterById.has(node.id);
      var labelVisible = active || neighbor || isolated || hubLabels.has(node.id) || clusterHub;
      var labelClass = "graph-label" + (labelVisible ? " is-visible" : "") + (active ? " is-active" : "") + (clusterHub ? " is-cluster-hub" : "");
      var labelLength = active || clusterHub ? 28 : neighbor ? 22 : 16;
      var label = '<text class="' + labelClass + '" text-anchor="middle" y="' + (radius + 18) + '">' + escapeHtml(trimLabel(node.title, labelLength)) + '</text>';
      var haloRadius = radius + (active ? 16 : 10);
      var priority = nodePriority(node);
      var shape = nodeShape(priority);
      return '<g class="' + classes + '" data-node-id="' + escapeAttr(node.id) + '" data-priority="' + formatNodePriority(priority) + '" data-shape="' + shape + '" transform="translate(' + point.x + ' ' + point.y + ')" style="--node-fill: ' + colors.fill + '; --node-stroke: ' + colors.stroke + ';">' +
        nodeShapeSvg(shape, "node-halo", haloRadius) +
        nodeShapeSvg(shape, "node-core", radius) +
        label +
        '<title>' + escapeHtml(node.title) + ' - ' + escapeHtml(node.kind) + ' - priority ' + formatNodePriority(priority) + ' - ' + degree + ' connection' + (degree > 1 ? "s" : "") + '</title>' +
      '</g>';
    });

    graph.innerHTML = '<svg width="' + displayWidth + '" height="' + displayHeight + '" viewBox="0 0 ' + width + ' ' + height + '" role="img">' + edges + graphNodes.join("") + '</svg>';
    centerGraphOnSelection(visible, positions, viewportWidth, viewportHeight, zoom);
  }

  function renderGraphFocus() {
    var node = nodeById.get(selectedId);
    if (!graphFocusActive || !node) {
      graphFocus.innerHTML = '<span>No node selected</span>';
      graphFocus.removeAttribute("tabindex");
      graphFocus.removeAttribute("role");
      graphFocus.removeAttribute("aria-label");
      return;
    }
    graphFocus.setAttribute("tabindex", "0");
    graphFocus.setAttribute("role", "button");
    graphFocus.setAttribute("aria-label", "View content for " + node.title);
    var degree = degreeById.get(node.id) || 0;
    graphFocus.innerHTML = '<div class="graph-focus-main"><strong>' + escapeHtml(node.title) + '</strong><span>' + escapeHtml(node.kind) + ' - ' + degree + ' connection' + (degree > 1 ? "s" : "") + '</span></div>' +
      '<div class="graph-focus-tag"><span class="graph-focus-action">Details</span></div>';
  }

  function renderDetail() {
    var node = nodeById.get(selectedId);
    if (!graphFocusActive || !node) {
      detail.innerHTML = '<p class="empty">No node selected.</p>';
      relations.innerHTML = '<p class="empty">No relation.</p>';
      content.innerHTML = '<p class="empty">No content.</p>';
      contentDetail.innerHTML = '<p class="empty">No content.</p>';
      return;
    }
    var colors = kindColors(node.kind);
    detail.innerHTML = '<div class="detail-title"><strong id="detail-title">' + escapeHtml(node.title) + '</strong>' +
      '<span class="detail-title-kind"><span class="tag" style="--tag-fill: ' + colors.fill + '; --tag-stroke: ' + colors.stroke + ';">' + escapeHtml(node.kind) + '</span>' +
      priorityBadge(node) + '</span></div>' +
      (node.summary ? '<p>' + escapeHtml(node.summary) + '</p>' : '<p>No summary for this node.</p>') +
      '<div class="detail-meta"><code>' + escapeHtml(node.id) + '</code><br>' +
      'Updated ' + escapeHtml(formatDate(node.dates && node.dates.updated_at || node.dates && node.dates.created_at)) + '</div>';

    var related = (node.relations || []).map(function (relation) {
      var target = nodeById.get(relation.to);
      var importance = relationImportance(relation);
      var targetKind = target ? target.kind : "node";
      var targetColors = kindColors(targetKind);
      return {
        importance: importance,
        title: target ? target.title : relation.to,
        html: '<li><button type="button" data-node-id="' + escapeAttr(relation.to) + '">' +
        '<span class="relation-importance" title="Importance ' + escapeAttr(formatImportance(importance)) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
        escapeHtml(formatImportance(importance)) + '</span>' +
        '<span class="relation-kind"><span class="tag" style="--tag-fill: ' + targetColors.fill + '; --tag-stroke: ' + targetColors.stroke + ';">' + escapeHtml(targetKind) + '</span></span>' +
        '<span class="relation-title">' + escapeHtml(target ? target.title : relation.to) + '</span>' +
        '</button></li>'
      };
    });
    nodes.forEach(function (source) {
      (source.relations || []).forEach(function (relation) {
        if (relation.to !== node.id) return;
        var importance = relationImportance(relation);
        var sourceColors = kindColors(source.kind);
        related.push({
          importance: importance,
          title: source.title,
          html: '<li><button type="button" data-node-id="' + escapeAttr(source.id) + '">' +
          '<span class="relation-importance" title="Importance ' + escapeAttr(formatImportance(importance)) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
          escapeHtml(formatImportance(importance)) + '</span>' +
          '<span class="relation-kind"><span class="tag" style="--tag-fill: ' + sourceColors.fill + '; --tag-stroke: ' + sourceColors.stroke + ';">' + escapeHtml(source.kind) + '</span></span>' +
          '<span class="relation-title">' + escapeHtml(source.title) + '</span>' +
          '</button></li>'
        });
      });
    });
    related.sort(function (left, right) {
      return right.importance - left.importance || left.title.localeCompare(right.title);
    });
    relations.innerHTML = related.length ? '<ul class="relation-list">' + related.map(function (item) { return item.html; }).join("") + '</ul>' : '<p class="empty">No known relation.</p>';

    var items = (node.content || []).map(function (item) {
      return '<li><span class="content-text">' + escapeHtml(item) + '</span></li>';
    });
    content.innerHTML = items.length ? '<ul class="content-list">' + items.join("") + '</ul>' : '<p class="empty">No content.</p>';
    renderContentDetail(node);
  }

  function renderContentDetail(node) {
    var lines = node && Array.isArray(node.content) ? node.content : [];
    if (lines.length === 0) {
      contentDetail.innerHTML = '<p class="empty">No content.</p>';
      return;
    }
    contentDetail.innerHTML = '<hr class="content-detail-separator">' +
      '<h2 class="content-detail-title">' + escapeHtml(node.title) + '</h2>' +
      '<ul class="content-detail-list">' + lines.map(function (item) {
        return '<li>' + escapeHtml(item) + '</li>';
      }).join("") + '</ul>';
  }

  function buildDegreeMap(list) {
    var degrees = new Map(list.map(function (node) { return [node.id, 0]; }));
    list.forEach(function (node) {
      (node.relations || []).forEach(function (relation) {
        if (!degrees.has(relation.to)) return;
        degrees.set(node.id, (degrees.get(node.id) || 0) + 1);
        degrees.set(relation.to, (degrees.get(relation.to) || 0) + 1);
      });
    });
    return degrees;
  }

  function mostConnectedNodeId(list, degrees) {
    if (list.length === 0) return "";
    return list.slice().sort(function (left, right) {
      return (degrees.get(right.id) || 0) - (degrees.get(left.id) || 0) ||
        left.title.localeCompare(right.title);
    })[0].id;
  }

  function fitLayoutToScrollableCanvas(visible, viewportWidth, viewportHeight) {
    var isSmallScreen = window.matchMedia("(max-width: 40em)").matches;
    var profile = galaxyScaleProfile(visible.length, isSmallScreen);
    var margin = profile.margin;
    var points = visible.map(function (node) {
      var point = layoutById.get(node.id) || { x: 0, y: 0 };
      return { id: node.id, x: point.x, y: point.y };
    });
    var bounds = points.reduce(function (box, point) {
      return {
        minX: Math.min(box.minX, point.x),
        maxX: Math.max(box.maxX, point.x),
        minY: Math.min(box.minY, point.y),
        maxY: Math.max(box.maxY, point.y)
      };
    }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    var sourceWidth = Math.max(1, bounds.maxX - bounds.minX);
    var sourceHeight = Math.max(1, bounds.maxY - bounds.minY);
    var zoom = autoGalaxyZoom(profile, sourceWidth, sourceHeight, viewportWidth, viewportHeight);
    var width = Math.ceil(Math.max(viewportWidth / zoom, viewportWidth * profile.canvasWidth, sourceWidth + margin * 2));
    var height = Math.ceil(Math.max(viewportHeight / zoom, viewportHeight * profile.canvasHeight, sourceHeight + margin * 2));
    var offsetX = margin + Math.max(0, width - sourceWidth - margin * 2) / 2;
    var offsetY = margin + Math.max(0, height - sourceHeight - margin * 2) / 2;
    var fitted = new Map();

    points.forEach(function (point) {
      fitted.set(point.id, {
        x: round(offsetX + point.x - bounds.minX),
        y: round(offsetY + point.y - bounds.minY)
      });
    });

    if (points.length === 1) {
      fitted.set(points[0].id, { x: width / 2, y: height / 2 });
    }

    return {
      width: width,
      height: height,
      zoom: zoom,
      positions: addNodeBreathingRoom(visible, snapLayoutToGrid(fitted, width, height, margin), width, height, margin)
    };
  }

  function galaxyScaleProfile(count, isSmallScreen) {
    var mature = clamp((count - 8) / 72, 0, 1);
    var veryLarge = clamp((count - 120) / 380, 0, 1);
    var huge = clamp((count - 500) / 1500, 0, 1);
    var scale = Math.log(Math.max(1, count)) / Math.log(2);
    return {
      margin: isSmallScreen
        ? Math.round(76 + mature * 48 + veryLarge * 34)
        : Math.round(112 + mature * 68 + veryLarge * 58),
      canvasWidth: 1.04 + mature * 1.12 + veryLarge * 0.82 + huge * 0.76,
      canvasHeight: 1.04 + mature * 1 + veryLarge * 0.74 + huge * 0.68,
      densityZoom: clamp(0.98 - scale * (isSmallScreen ? 0.07 : 0.062), isSmallScreen ? 0.3 : 0.34, isSmallScreen ? 0.86 : 0.92),
      minZoom: isSmallScreen ? 0.3 : 0.34,
      maxZoom: isSmallScreen ? 0.88 : 0.96
    };
  }

  function autoGalaxyZoom(profile, sourceWidth, sourceHeight, viewportWidth, viewportHeight) {
    var fitZoom = Math.min(viewportWidth / Math.max(1, sourceWidth + profile.margin * 2), viewportHeight / Math.max(1, sourceHeight + profile.margin * 1.75));
    var relaxedZoom = Math.min(profile.densityZoom, fitZoom * 1.08);
    return round(clamp(relaxedZoom, profile.minZoom, profile.maxZoom));
  }

  function centerGraphOnSelection(visible, positions, viewportWidth, viewportHeight, zoom) {
    var selected = positions.get(selectedId);
    var key = selectedId + ":" + visibleSignature(visible) + ":" + query + ":" + viewportWidth + ":" + viewportHeight + ":" + zoom;
    if (!selected || key === lastGraphCenterKey) return;
    lastGraphCenterKey = key;
    window.requestAnimationFrame(function () {
      graph.scrollLeft = Math.max(0, selected.x * zoom - graph.clientWidth / 2);
      graph.scrollTop = Math.max(0, selected.y * zoom - graph.clientHeight / 2);
    });
  }

  function visibleSignature(visible) {
    return visible.map(function (node) { return node.id; }).join("|");
  }

  function hashNodeId() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    var nodeId = params.get("node") || "";
    return nodeById.has(nodeId) ? nodeId : "";
  }

  function updateNodeHash(nodeId) {
    if (!nodeId) return;
    var nextHash = "node=" + encodeURIComponent(nodeId);
    if (window.location.hash.replace(/^#/, "") === nextHash) return;
    history.replaceState(null, "", "#" + nextHash);
  }

  function clearNodeHash() {
    if (!window.location.hash) return;
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  function hubLabelIds(visible) {
    var labelCount = Math.min(6, Math.max(3, Math.round(Math.sqrt(visible.length))));
    return new Set(visible
      .filter(function (node) { return (degreeById.get(node.id) || 0) > 0; })
      .sort(function (left, right) {
        return (degreeById.get(right.id) || 0) - (degreeById.get(left.id) || 0) ||
          left.title.localeCompare(right.title);
      })
      .slice(0, labelCount)
      .map(function (node) { return node.id; }));
  }

  function relatedNodeIds(selected, visibleIds) {
    var ids = new Set();
    if (!selected) return ids;
    (selected.relations || []).forEach(function (relation) {
      if (visibleIds.has(relation.to)) ids.add(relation.to);
    });
    nodes.forEach(function (node) {
      if (!visibleIds.has(node.id)) return;
      (node.relations || []).forEach(function (relation) {
        if (relation.to === selected.id) ids.add(node.id);
      });
    });
    return ids;
  }

  function renderFocusedEdges(visible, visibleIds, positions, colors) {
    var edges = [];
    visible.forEach(function (node) {
      (node.relations || []).forEach(function (relation) {
        if (!visibleIds.has(relation.to)) return;
        var active = node.id === selectedId || relation.to === selectedId;
        if (!active) return;
        var from = positions.get(node.id);
        var to = positions.get(relation.to);
        if (!from || !to) return;
        var importance = relationImportance(relation);
        var strokeWidth = round(0.75 + importance * 1.65);
        var opacity = 0.48 + importance * 0.28;
        var path = organicEdgePath(node.id, relation.to, from, to, importance);
        var style = ' style="--active-edge: ' + colors.stroke + '; stroke-width: ' + strokeWidth + '; opacity: ' + opacity + ';"';
        edges.push('<path class="edge"' + style + ' d="' + path + '"><title>Importance ' + formatImportance(importance) + '</title></path>');
      });
    });
    return edges.join("");
  }

  function organicEdgePath(fromId, toId, from, to, importance) {
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var distance = Math.sqrt(dx * dx + dy * dy) || 1;
    var normalX = -dy / distance;
    var normalY = dx / distance;
    var bendDirection = hashHue(pairKey(fromId, toId)) % 2 === 0 ? 1 : -1;
    var bend = bendDirection * Math.min(160, Math.max(26, distance * (0.1 + (1 - importance) * 0.18)));
    var controlPull = 0.42;
    var c1 = {
      x: round(from.x + dx * controlPull + normalX * bend),
      y: round(from.y + dy * controlPull + normalY * bend)
    };
    var c2 = {
      x: round(to.x - dx * controlPull + normalX * bend * 0.72),
      y: round(to.y - dy * controlPull + normalY * bend * 0.72)
    };
    return "M " + from.x + " " + from.y + " C " + c1.x + " " + c1.y + " " + c2.x + " " + c2.y + " " + to.x + " " + to.y;
  }

  function buildGalaxyLayout(list, degrees, model, nodeByCluster, clusterRadii) {
    var layout = new Map();
    var clusters = clusterCenters(model.clusters, list.length, model, clusterRadii);
    snapClusterCenters(clusters);
    var occupiedCells = new Set();

    model.clusters.forEach(function (cluster) {
      var center = clusters.get(cluster.id) || { x: 0, y: 0 };
      var hub = nodeById.get(cluster.hubId);
      if (!hub) return;
      layout.set(hub.id, { x: center.x, y: center.y });
      occupyCell(occupiedCells, center);
    });

    placeSingleClusterNodes(model.clusters, nodeByCluster, clusters, clusterRadii, layout, occupiedCells, degrees, model);
    placeOutsideClusterNodes(list, clusters, clusterRadii, layout, occupiedCells, degrees, model);
    placeIsolatedNodes(list, clusters, clusterRadii, layout, occupiedCells, degrees);

    list.forEach(function (node) {
      if (!layout.has(node.id)) {
        var fallbackPoint = fallbackOutsideGridPoint(layout.size, clusters, clusterRadii, occupiedCells);
        layout.set(node.id, fallbackPoint);
        occupyCell(occupiedCells, fallbackPoint);
      }
    });

    list.forEach(function (node) {
      var point = layout.get(node.id);
      layout.set(node.id, { x: round(point.x), y: round(point.y) });
    });

    return layout;
  }

  function nodesByCluster(list, model) {
    var groups = new Map();
    list.forEach(function (node) {
      var clusterId = model.clusterByNode.get(node.id) || node.id;
      if (!groups.has(clusterId)) groups.set(clusterId, []);
      groups.get(clusterId).push(node);
    });
    groups.forEach(function (members) {
      members.sort(function (left, right) {
        return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
      });
    });
    return groups;
  }

  function snapClusterCenters(clusters) {
    var cell = galaxyCellSize();
    var occupied = new Set();
    clusters.forEach(function (point, clusterId) {
      var snapped = nextFreeCell(snapPointToCell(point, cell), occupied, cell);
      clusters.set(clusterId, snapped);
      occupied.add(cellKey(snapped, cell));
    });
  }

  function placeSingleClusterNodes(clustersList, nodeByCluster, clusters, clusterRadii, layout, occupiedCells, degrees, model) {
    clustersList.forEach(function (cluster) {
      var center = clusters.get(cluster.id);
      if (!center) return;
      var members = (nodeByCluster.get(cluster.id) || [])
        .filter(function (node) { return !layout.has(node.id); })
        .sort(function (left, right) {
          return clusterPull(right, cluster.id, cluster.hubId, model) - clusterPull(left, cluster.id, cluster.hubId, model) ||
            (degrees.get(right.id) || 0) - (degrees.get(left.id) || 0) ||
            left.title.localeCompare(right.title) ||
            left.id.localeCompare(right.id);
      });
      members.forEach(function (node, index) {
        var importance = clusterPull(node, cluster.id, cluster.hubId, model);
        var hub = nodeById.get(cluster.hubId);
        var point = bestClusterCell(singleClusterPoint(center, clusterRadii.get(cluster.id) || 120, importance, index, hub, node), center, clusterRadii.get(cluster.id) || 120, occupiedCells);
        layout.set(node.id, point);
        occupyCell(occupiedCells, point);
      });
    });
  }

  function placeOutsideClusterNodes(list, clusters, clusterRadii, layout, occupiedCells, degrees, model) {
    list.slice()
      .filter(function (node) { return !layout.has(node.id) && (degrees.get(node.id) || 0) > 0; })
      .sort(function (left, right) {
        return clusterBridgeIds(right, model).length - clusterBridgeIds(left, model).length ||
          outsidePlacedNeighborImportance(right, layout, model) - outsidePlacedNeighborImportance(left, layout, model) ||
          (degrees.get(right.id) || 0) - (degrees.get(left.id) || 0) ||
          left.title.localeCompare(right.title) ||
          left.id.localeCompare(right.id);
      })
      .forEach(function (node, index) {
        var ideal = outsideBridgePoint(node, clusters, model) ||
          outsidePlacedNeighborPoint(node, layout, model) ||
          fallbackOutsideGridPoint(index, clusters, clusterRadii, occupiedCells);
        var point = bestOutsideGridCell(ideal, clusters, clusterRadii, occupiedCells);
        layout.set(node.id, point);
        occupyCell(occupiedCells, point);
      });
  }

  function placeIsolatedNodes(list, clusters, clusterRadii, layout, occupiedCells, degrees) {
    var isolated = list.slice()
      .filter(function (node) { return !layout.has(node.id) && (degrees.get(node.id) || 0) === 0; })
      .sort(function (left, right) {
        return nodePriority(right) - nodePriority(left) ||
          left.title.localeCompare(right.title) ||
          left.id.localeCompare(right.id);
      });
    if (isolated.length === 0) return;

    var cell = galaxyCellSize();
    var origin = isolatedZoneOrigin(clusters, clusterRadii, cell);
    var columns = Math.max(2, Math.ceil(Math.sqrt(isolated.length)));
    isolated.forEach(function (node, index) {
      var row = Math.floor(index / columns);
      var column = index % columns;
      var stagger = row % 2 ? cell * 0.5 : 0;
      var ideal = {
        x: origin.x + column * cell * 1.8 + stagger,
        y: origin.y + row * cell * 1.65
      };
      var point = bestIsolatedGridCell(ideal, clusters, clusterRadii, occupiedCells);
      layout.set(node.id, point);
      occupyCell(occupiedCells, point);
    });
  }

  function outsideBridgePoint(node, clusters, model) {
    var zoneIds = clusterBridgeIds(node, model);
    if (zoneIds.length === 0) return null;
    if (zoneIds.length === 2) {
      return bridgePairPoint(node, zoneIds[0], zoneIds[1], clusters, model);
    }
    var entries = bridgeClusterEntries(node, zoneIds, clusters, model);
    var dominant = dominantBridgeEntry(entries);
    var weighted = { x: 0, y: 0, weight: 0 };
    entries.forEach(function (entry) {
      weighted.x += entry.center.x * entry.weight;
      weighted.y += entry.center.y * entry.weight;
      weighted.weight += entry.weight;
    });
    if (weighted.weight === 0) return clusters.get(zoneIds[0]) || null;
    var centerPoint = { x: weighted.x / weighted.weight, y: weighted.y / weighted.weight };
    if (dominant) {
      centerPoint = {
        x: dominant.center.x * 0.78 + centerPoint.x * 0.22,
        y: dominant.center.y * 0.78 + centerPoint.y * 0.22
      };
    }
    return offsetBridgePoint(centerPoint, zoneIds.join("::"), dominant ? 1.05 : 1.4);
  }

  function bridgePairPoint(node, leftId, rightId, clusters, model) {
    var left = clusters.get(leftId);
    var right = clusters.get(rightId);
    if (!left || !right) return left || right || null;
    var leftCluster = model.clusterById.get(leftId);
    var rightCluster = model.clusterById.get(rightId);
    var leftImportance = leftCluster ? relationStrength(node.id, leftCluster.hubId, model.adjacency) : 0.5;
    var rightImportance = rightCluster ? relationStrength(node.id, rightCluster.hubId, model.adjacency) : 0.5;
    var t = bridgePairRatio(leftImportance, rightImportance);
    var base = {
      x: left.x + (right.x - left.x) * t,
      y: left.y + (right.y - left.y) * t
    };
    var dx = right.x - left.x;
    var dy = right.y - left.y;
    var distance = Math.sqrt(dx * dx + dy * dy) || 1;
    var direction = hashHue(pairKey(leftId, rightId)) % 2 === 0 ? 1 : -1;
    var lane = galaxyCellSize() * (1.25 + (hashHue(pairKey(leftId, rightId) + ":lane") % 4) * 0.45);
    return {
      x: base.x + (-dy / distance) * lane * direction,
      y: base.y + (dx / distance) * lane * direction
    };
  }

  function offsetBridgePoint(point, key, scale) {
    var angle = hashHue(key) * Math.PI / 180;
    var distance = galaxyCellSize() * (1.25 + (hashHue(key + ":lane") % 4) * 0.45) * scale;
    return {
      x: point.x + Math.cos(angle) * distance,
      y: point.y + Math.sin(angle) * distance
    };
  }

  function bridgeWeight(importance) {
    return Math.pow(relationImportance({ importance: importance }), 1.45);
  }

  function bridgeClusterEntries(node, zoneIds, clusters, model) {
    return zoneIds.map(function (clusterId) {
      var center = clusters.get(clusterId);
      var cluster = model.clusterById.get(clusterId);
      var importance = cluster ? relationStrength(node.id, cluster.hubId, model.adjacency) : 0.5;
      return {
        clusterId: clusterId,
        center: center,
        importance: relationImportance({ importance: importance }),
        weight: bridgeWeight(importance)
      };
    }).filter(function (entry) {
      return Boolean(entry.center);
    });
  }

  function dominantBridgeEntry(entries) {
    var sorted = entries.slice().sort(function (left, right) {
      return right.importance - left.importance || left.clusterId.localeCompare(right.clusterId);
    });
    if (sorted.length === 0) return null;
    if (sorted.length === 1) return sorted[0];
    return sorted[0].importance - sorted[1].importance > 0.04 ? sorted[0] : null;
  }

  function bridgePairRatio(leftImportance, rightImportance) {
    var left = relationImportance({ importance: leftImportance });
    var right = relationImportance({ importance: rightImportance });
    if (Math.abs(left - right) <= 0.06) return 0.5;
    var leftWeight = bridgeWeight(left);
    var rightWeight = bridgeWeight(right);
    return clamp(rightWeight / (leftWeight + rightWeight || 1), 0.16, 0.84);
  }

  function clusterBridgeIds(node, model) {
    if (model.clusterById.has(node.id)) return [node.id];
    return model.clusters
      .filter(function (cluster) {
        return relationStrength(node.id, cluster.hubId, model.adjacency) > 0;
      })
      .map(function (cluster) { return cluster.id; });
  }

  function bestClusterCell(ideal, center, radius, occupiedCells) {
    var cell = galaxyCellSize();
    var snapped = snapPointToCell(ideal, cell);
    return nearestMatchingCell(snapped, ideal, occupiedCells, cell, 18, function (point) {
      return pointInClusterCircle(point, center, radius);
    }) || snapped;
  }

  function pointInClusterCircle(point, center, radius) {
    return pointDistance(point, center) <= Math.max(galaxyCellSize() * 2, radius - galaxyCellSize());
  }

  function singleClusterPoint(center, clusterRadius, importance, index, hub, node) {
    var value = relationPlacementWeight(importance);
    var angle = index * 2.399963229728653 + hashHue(String(index)) * 0.0007;
    var minRing = nodeCollisionRadius(hub) + nodeCollisionRadius(node) + 8;
    var maxRing = Math.max(minRing + 10, clusterRadius - nodeCollisionRadius(node));
    var ring = clamp(clusterRadius * (0.24 + (1 - value) * 0.2), minRing, maxRing);
    return {
      x: center.x + Math.cos(angle) * ring,
      y: center.y + Math.sin(angle) * ring
    };
  }

  function bestOutsideGridCell(ideal, clusters, clusterRadii, occupiedCells) {
    var cell = galaxyCellSize();
    var snapped = snapPointToCell(ideal, cell);
    var outside = nearestMatchingCell(snapped, ideal, occupiedCells, cell, 48, function (point) {
      return cellOutsideAllClusters(point, clusters, clusterRadii);
    });
    if (outside) return outside;

    var pushed = pushPointOutsideClusters(snapped, clusters, clusterRadii);
    return nearestMatchingCell(pushed, pushed, occupiedCells, cell, 24, function (point) {
      return cellOutsideAllClusters(point, clusters, clusterRadii);
    }) || pushed;
  }

  function bestIsolatedGridCell(ideal, clusters, clusterRadii, occupiedCells) {
    var cell = galaxyCellSize();
    var snapped = snapPointToCell(ideal, cell);
    return nearestMatchingCell(snapped, ideal, occupiedCells, cell, 36, function (point) {
      return cellOutsideAllClusters(point, clusters, clusterRadii);
    }) || snapped;
  }

  function outsidePlacedNeighborPoint(node, layout, model) {
    var anchor = strongestPlacedNeighbor(node, layout, model);
    return anchor ? anchor.point : null;
  }

  function outsidePlacedNeighborImportance(node, layout, model) {
    var anchor = strongestPlacedNeighbor(node, layout, model);
    return anchor ? anchor.importance : 0;
  }

  function strongestPlacedNeighbor(node, layout, model) {
    var neighbors = model.adjacency.get(node.id);
    if (!neighbors) return null;
    var strongest = null;
    neighbors.forEach(function (importance, neighborId) {
      var neighborPoint = layout.get(neighborId);
      if (neighborPoint) {
        if (!strongest || importance > strongest.importance) {
          strongest = { point: neighborPoint, importance: importance };
        }
      }
    });
    return strongest;
  }

  function cellOutsideAllClusters(point, clusters, clusterRadii) {
    var outside = true;
    clusters.forEach(function (center, clusterId) {
      if (pointInClusterCircle(point, center, clusterRadii.get(clusterId) || 0)) outside = false;
    });
    return outside;
  }

  function pushPointOutsideClusters(point, clusters, clusterRadii) {
    var cell = galaxyCellSize();
    var pushed = { x: point.x, y: point.y };
    clusters.forEach(function (center, clusterId) {
      var radius = clusterRadii.get(clusterId) || 0;
      if (!pointInClusterCircle(pushed, center, radius)) return;
      var dx = pushed.x - center.x;
      var dy = pushed.y - center.y;
      var distance = Math.sqrt(dx * dx + dy * dy) || 1;
      var target = radius + cell;
      pushed.x = center.x + dx / distance * target;
      pushed.y = center.y + dy / distance * target;
      pushed = snapPointToCell(pushed, cell);
    });
    return pushed;
  }

  function nearestMatchingCell(origin, ideal, occupiedCells, cell, maxRing, matches) {
    var best = null;
    for (var ring = 0; ring <= maxRing; ring += 1) {
      for (var dx = -ring; dx <= ring; dx += 1) {
        for (var dy = -ring; dy <= ring; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          var point = { x: origin.x + dx * cell, y: origin.y + dy * cell };
          if (occupiedCells.has(cellKey(point, cell))) continue;
          if (!matches(point)) continue;
          if (!best || pointDistance(point, ideal) < pointDistance(best, ideal)) best = point;
        }
      }
      if (best) return best;
    }
    return null;
  }

  function snapPointToCell(point, cell) {
    return { x: snapValueToCellCenter(point.x, cell), y: snapValueToCellCenter(point.y, cell) };
  }

  function snapValueToCellCenter(value, cell) {
    return Math.round((value - cell / 2) / cell) * cell + cell / 2;
  }

  function occupyCell(occupiedCells, point) {
    occupiedCells.add(cellKey(point, galaxyCellSize()));
  }

  function cellKey(point, cell) {
    return Math.round((point.x - cell / 2) / cell) + ":" + Math.round((point.y - cell / 2) / cell);
  }

  function nextFreeCell(origin, occupiedCells, cell) {
    for (var ring = 0; ring <= 18; ring += 1) {
      for (var dx = -ring; dx <= ring; dx += 1) {
        for (var dy = -ring; dy <= ring; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          var point = { x: origin.x + dx * cell, y: origin.y + dy * cell };
          if (!occupiedCells.has(cellKey(point, cell))) return point;
        }
      }
    }
    return origin;
  }

  function fallbackOutsideGridPoint(index, clusters, clusterRadii, occupiedCells) {
    var cell = galaxyCellSize();
    var direction = gridDirection(index);
    var distance = cell * (6 + Math.floor(index / 8));
    var origin = { x: direction.x * distance, y: direction.y * distance };
    return bestOutsideGridCell(origin, clusters, clusterRadii, occupiedCells);
  }

  function isolatedZoneOrigin(clusters, clusterRadii, cell) {
    if (clusters.size === 0) return { x: cell * 3, y: cell * -3 };
    var bounds = clusterBounds(clusters, clusterRadii);
    return {
      x: bounds.maxX + cell * 5,
      y: bounds.minY
    };
  }

  function clusterBounds(clusters, clusterRadii) {
    var bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    clusters.forEach(function (center, id) {
      var radius = clusterRadii.get(id) || 140;
      bounds.minX = Math.min(bounds.minX, center.x - radius);
      bounds.maxX = Math.max(bounds.maxX, center.x + radius);
      bounds.minY = Math.min(bounds.minY, center.y - radius);
      bounds.maxY = Math.max(bounds.maxY, center.y + radius);
    });
    return bounds;
  }

  function galaxyCellSize() {
    return 36;
  }

  function gridDirection(index) {
    var directions = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      { x: 0.707, y: 0.707 },
      { x: -0.707, y: 0.707 },
      { x: -0.707, y: -0.707 },
      { x: 0.707, y: -0.707 }
    ];
    return directions[index % directions.length];
  }

  function clusterPull(node, clusterId, hubId, model) {
    var adjacency = model.adjacency;
    var directHub = relationStrength(node.id, hubId, adjacency);
    var neighbors = adjacency.get(node.id);
    var strongestClusterLink = 0;
    if (neighbors) {
      neighbors.forEach(function (importance, neighborId) {
        if ((model.clusterByNode.get(neighborId) || neighborId) === clusterId) {
          strongestClusterLink = Math.max(strongestClusterLink, importance);
        }
      });
    }
    return Math.max(0.08, directHub, strongestClusterLink);
  }

  function pointDistance(left, right) {
    var dx = left.x - right.x;
    var dy = left.y - right.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function clusterLayoutRadii(clusters, nodeByCluster, adjacency) {
    var radii = new Map();
    clusters.forEach(function (cluster) {
      var members = nodeByCluster.get(cluster.id) || [];
      var activity = clusterRelationActivity(members, adjacency);
      radii.set(cluster.id, clusterRadiusFromActivity(members.length, activity.linkedNodeCount, activity.relationWeight));
    });
    return radii;
  }

  function clusterRelationActivity(members, adjacency) {
    var linkedNodeIds = new Set();
    var relationWeight = 0;
    members.forEach(function (node) {
      var neighbors = adjacency.get(node.id);
      if (!neighbors) return;
      neighbors.forEach(function (importance, neighborId) {
        linkedNodeIds.add(neighborId);
        relationWeight += importance || 0.5;
      });
    });
    return {
      linkedNodeCount: linkedNodeIds.size,
      relationWeight: relationWeight
    };
  }

  function clusterRadiusFromActivity(memberCount, linkedNodeCount, relationWeight) {
    var radius = 92 +
      Math.sqrt(Math.max(1, memberCount)) * 28 +
      Math.sqrt(Math.max(0, linkedNodeCount)) * 10 +
      Math.sqrt(Math.max(0, relationWeight)) * 6;
    return Math.min(Math.max(120, radius), 260);
  }

  function clusterCenters(clusters, totalNodes, model, clusterRadii) {
    var centers = initialClusterCenters(clusters, totalNodes);
    var links = clusterLinks(clusters, model);
    for (var step = 0; step < 120; step += 1) {
      relaxClusterCenters(clusters, centers, links, clusterRadii, totalNodes);
    }
    return normalizeClusterCenters(centers);
  }

  function initialClusterCenters(clusters, totalNodes) {
    var centers = new Map();
    var radius = Math.max(260, 155 + Math.sqrt(Math.max(1, totalNodes)) * 28);
    clusters
      .slice()
      .sort(function (left, right) {
        return right.size - left.size || left.id.localeCompare(right.id);
      })
      .forEach(function (cluster, index) {
        var angle = -Math.PI / 2 + index * (Math.PI * 2 / Math.max(1, clusters.length));
        centers.set(cluster.id, {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        });
      });
    return centers;
  }

  function clusterLinks(clusters, model) {
    var links = [];
    for (var leftIndex = 0; leftIndex < clusters.length; leftIndex += 1) {
      for (var rightIndex = leftIndex + 1; rightIndex < clusters.length; rightIndex += 1) {
        var left = clusters[leftIndex];
        var right = clusters[rightIndex];
        var strength = clusterLinkStrength(left.id, right.id, model);
        if (strength > 0) links.push({ leftId: left.id, rightId: right.id, strength: strength });
      }
    }
    return links;
  }

  function relaxClusterCenters(clusters, centers, links, clusterRadii, totalNodes) {
    var movement = new Map();
    clusters.forEach(function (cluster) {
      movement.set(cluster.id, { x: 0, y: 0 });
    });

    for (var leftIndex = 0; leftIndex < clusters.length; leftIndex += 1) {
      for (var rightIndex = leftIndex + 1; rightIndex < clusters.length; rightIndex += 1) {
        var left = clusters[leftIndex];
        var right = clusters[rightIndex];
        var leftPoint = centers.get(left.id);
        var rightPoint = centers.get(right.id);
        var vector = normalizedVector(leftPoint, rightPoint);
        var distance = pointDistance(leftPoint, rightPoint) || 1;
        var minDistance = (clusterRadii.get(left.id) || 140) + (clusterRadii.get(right.id) || 140) + galaxyCellSize() * 2.2;
        var repel = Math.max(0, minDistance - distance) * 0.016 + 1500 / (distance * distance);
        movement.get(left.id).x -= vector.x * repel;
        movement.get(left.id).y -= vector.y * repel;
        movement.get(right.id).x += vector.x * repel;
        movement.get(right.id).y += vector.y * repel;
      }
    }

    links.forEach(function (link) {
      var leftPoint = centers.get(link.leftId);
      var rightPoint = centers.get(link.rightId);
      if (!leftPoint || !rightPoint) return;
      var vector = normalizedVector(leftPoint, rightPoint);
      var distance = pointDistance(leftPoint, rightPoint) || 1;
      var ideal = clusterIdealDistance(link, clusterRadii, totalNodes);
      var pull = (distance - ideal) * Math.min(0.035, 0.012 + link.strength * 0.004);
      movement.get(link.leftId).x += vector.x * pull;
      movement.get(link.leftId).y += vector.y * pull;
      movement.get(link.rightId).x -= vector.x * pull;
      movement.get(link.rightId).y -= vector.y * pull;
    });

    centers.forEach(function (point, clusterId) {
      var delta = movement.get(clusterId) || { x: 0, y: 0 };
      point.x += clamp(delta.x, -12, 12);
      point.y += clamp(delta.y, -12, 12);
    });
  }

  function normalizedVector(left, right) {
    var dx = right.x - left.x;
    var dy = right.y - left.y;
    var distance = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / distance, y: dy / distance };
  }

  function clusterIdealDistance(link, clusterRadii, totalNodes) {
    var leftRadius = clusterRadii.get(link.leftId) || 140;
    var rightRadius = clusterRadii.get(link.rightId) || 140;
    var base = leftRadius + rightRadius + galaxyCellSize() * 3.4;
    var strengthBonus = Math.min(150, link.strength * 36);
    return Math.max(base, 220 + Math.sqrt(Math.max(1, totalNodes)) * 6 - strengthBonus);
  }

  function normalizeClusterCenters(centers) {
    var average = { x: 0, y: 0 };
    centers.forEach(function (point) {
      average.x += point.x;
      average.y += point.y;
    });
    average.x /= Math.max(1, centers.size);
    average.y /= Math.max(1, centers.size);
    centers.forEach(function (point, clusterId) {
      centers.set(clusterId, { x: point.x - average.x, y: point.y - average.y });
    });
    return centers;
  }

  function clusterLinkStrength(leftClusterId, rightClusterId, model) {
    var strength = 0;
    var leftCluster = model.clusterById.get(leftClusterId);
    var rightCluster = model.clusterById.get(rightClusterId);
    var leftHubId = leftCluster && leftCluster.hubId;
    var rightHubId = rightCluster && rightCluster.hubId;
    model.adjacency.forEach(function (neighbors, nodeId) {
      var nodeClusterId = model.clusterByNode.get(nodeId);
      if (leftHubId && rightHubId) {
        var leftStrength = relationStrength(nodeId, leftHubId, model.adjacency);
        var rightStrength = relationStrength(nodeId, rightHubId, model.adjacency);
        if (leftStrength > 0 && rightStrength > 0) {
          strength += Math.min(leftStrength, rightStrength);
        }
      }
      if (nodeClusterId !== leftClusterId) return;
      neighbors.forEach(function (importance, neighborId) {
        if (model.clusterByNode.get(neighborId) === rightClusterId) {
          strength += importance || 0.5;
        }
      });
    });
    return strength;
  }

  function buildClusterModel(list, degrees) {
    var edges = graphEdges(list);
    var adjacency = buildAdjacency(edges);
    var hubs = selectClusterHubs(list, degrees, adjacency);

    if (hubs.length === 0) {
      hubs = list.slice()
        .filter(function (node) { return (degrees.get(node.id) || 0) > 0; })
        .sort(function (left, right) {
          return (degrees.get(right.id) || 0) - (degrees.get(left.id) || 0) ||
            left.title.localeCompare(right.title);
        })
        .slice(0, 1);
    }
    if (hubs.length === 0 && list.length > 0) hubs = [list[0]];

    var clusters = hubs.map(function (hub) {
      return { id: hub.id, hubId: hub.id, size: 0 };
    });
    var clusterById = new Map(clusters.map(function (cluster) { return [cluster.id, cluster]; }));
    var clusterByNode = new Map();
    var clusterCoreByNode = new Map();

    hubs.forEach(function (hub) {
      clusterByNode.set(hub.id, hub.id);
      clusterCoreByNode.set(hub.id, true);
      var cluster = clusterById.get(hub.id);
      cluster.size += 1;
    });

    list.slice()
      .filter(function (node) { return !clusterByNode.has(node.id); })
      .sort(function (left, right) {
        return (degrees.get(right.id) || 0) - (degrees.get(left.id) || 0) ||
          left.title.localeCompare(right.title);
      })
      .forEach(function (node) {
        var directClusters = clusters
          .map(function (cluster) {
            return { cluster: cluster, strength: relationStrength(node.id, cluster.hubId, adjacency) };
          })
          .filter(function (entry) { return entry.strength > 0; })
          .sort(function (left, right) {
            return right.strength - left.strength ||
              right.cluster.size - left.cluster.size ||
              left.cluster.id.localeCompare(right.cluster.id);
          });
        if (directClusters.length !== 1) return;
        clusterByNode.set(node.id, directClusters[0].cluster.id);
        clusterCoreByNode.set(node.id, true);
        directClusters[0].cluster.size += 1;
      });

    return { clusters: clusters, clusterById: clusterById, clusterByNode: clusterByNode, clusterCoreByNode: clusterCoreByNode, adjacency: adjacency };
  }

  function selectClusterHubs(list, degrees, adjacency) {
    var covered = new Set();
    return list.slice()
      .filter(function (node) { return (degrees.get(node.id) || 0) >= 3; })
      .sort(function (left, right) {
        return (degrees.get(right.id) || 0) - (degrees.get(left.id) || 0) ||
          left.title.localeCompare(right.title);
      })
      .filter(function (node) {
        if (covered.has(node.id)) return false;
        covered.add(node.id);
        var neighbors = adjacency.get(node.id);
        if (neighbors) {
          neighbors.forEach(function (importance, neighborId) {
            covered.add(neighborId);
          });
        }
        return true;
      });
  }

  function buildAdjacency(edges) {
    var adjacency = new Map();
    edges.forEach(function (edge) {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Map());
      if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Map());
      adjacency.get(edge.from).set(edge.to, edge.importance);
      adjacency.get(edge.to).set(edge.from, edge.importance);
    });
    return adjacency;
  }

  function relationStrength(leftId, rightId, adjacency) {
    var neighbors = adjacency.get(leftId);
    return neighbors && neighbors.get(rightId) || 0;
  }

  function graphEdges(list) {
    var ids = new Set(list.map(function (node) { return node.id; }));
    var seen = new Map();
    var edges = [];
    list.forEach(function (node) {
      (node.relations || []).forEach(function (relation) {
        if (!ids.has(relation.to)) return;
        var key = [node.id, relation.to].sort().join("::");
        var importance = relationImportance(relation);
        var existing = seen.get(key);
        if (existing) {
          existing.importance = Math.max(existing.importance, importance);
          return;
        }
        var edge = { from: node.id, to: relation.to, importance: importance };
        seen.set(key, edge);
        edges.push(edge);
      });
    });
    return edges;
  }

  function snapLayoutToGrid(layout, width, height, margin) {
    var grid = galaxyCellSize();
    var minX = snapValueToCellCenter(margin / 2, grid);
    var maxX = snapValueToCellCenter(width - margin / 2, grid);
    var minY = snapValueToCellCenter(margin / 2, grid);
    var maxY = snapValueToCellCenter(height - margin / 2, grid);
    var occupied = new Set();
    layout.forEach(function (point, id) {
      var snapped = {
        x: clamp(snapValueToCellCenter(point.x, grid), minX, maxX),
        y: clamp(snapValueToCellCenter(point.y, grid), minY, maxY)
      };
      if (occupied.has(cellKey(snapped, grid))) {
        snapped = nextFreeBoundedCell(snapped, occupied, grid, minX, maxX, minY, maxY);
      }
      layout.set(id, snapped);
      occupied.add(cellKey(snapped, grid));
    });
    return layout;
  }

  function nextFreeBoundedCell(origin, occupiedCells, cell, minX, maxX, minY, maxY) {
    for (var ring = 0; ring <= 24; ring += 1) {
      for (var dx = -ring; dx <= ring; dx += 1) {
        for (var dy = -ring; dy <= ring; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          var point = { x: origin.x + dx * cell, y: origin.y + dy * cell };
          if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) continue;
          if (!occupiedCells.has(cellKey(point, cell))) return point;
        }
      }
    }
    return origin;
  }

  function addNodeBreathingRoom(list, positions, width, height, margin) {
    var padding = 8;
    var minX = margin / 2;
    var maxX = width - margin / 2;
    var minY = margin / 2;
    var maxY = height - margin / 2;
    for (var step = 0; step < 28; step += 1) {
      for (var leftIndex = 0; leftIndex < list.length; leftIndex += 1) {
        for (var rightIndex = leftIndex + 1; rightIndex < list.length; rightIndex += 1) {
          var left = list[leftIndex];
          var right = list[rightIndex];
          var leftPoint = positions.get(left.id);
          var rightPoint = positions.get(right.id);
          if (!leftPoint || !rightPoint) continue;
          var dx = rightPoint.x - leftPoint.x;
          var dy = rightPoint.y - leftPoint.y;
          var distance = Math.sqrt(dx * dx + dy * dy);
          if (distance === 0) {
            var angle = hashHue(pairKey(left.id, right.id)) * Math.PI / 180;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            distance = 1;
          }
          var wanted = nodeCollisionRadius(left) + nodeCollisionRadius(right) + padding;
          if (distance >= wanted) continue;
          var push = Math.min(8, (wanted - distance) / 2);
          var moveX = dx / distance * push;
          var moveY = dy / distance * push;
          leftPoint.x = clamp(leftPoint.x - moveX, minX, maxX);
          leftPoint.y = clamp(leftPoint.y - moveY, minY, maxY);
          rightPoint.x = clamp(rightPoint.x + moveX, minX, maxX);
          rightPoint.y = clamp(rightPoint.y + moveY, minY, maxY);
        }
      }
    }
    positions.forEach(function (point, id) {
      positions.set(id, { x: round(point.x), y: round(point.y) });
    });
    return positions;
  }

  function nodeCollisionRadius(node) {
    if (!node) return 18;
    return nodeRadius(node, false) + 12;
  }

  function pairKey(leftId, rightId) {
    return [leftId, rightId].sort().join("::");
  }

  function nodeRadius(node, isSelected) {
    var degree = degreeById.get(node.id) || 0;
    if (degree === 0) return isSelected ? 13 : 9;
    var maxDegree = Math.max.apply(null, Array.from(degreeById.values()).concat([1]));
    var weight = Math.pow(degree / maxDegree, 0.48);
    var radius = 4.5 + weight * 25;
    return Math.round(Math.min(38, radius));
  }

  function nodePriority(node) {
    var value = node && typeof node.priority === "number" ? node.priority : 0.5;
    return clamp(value, 0, 1);
  }

  function nodeShape(priority) {
    if (priority <= 0.3) return "square";
    if (priority >= 0.7) return "triangle";
    return "circle";
  }

  function nodeShapeSvg(shape, className, radius) {
    if (shape === "triangle") {
      return '<polygon class="' + className + '" points="' + trianglePoints(radius) + '"></polygon>';
    }
    if (shape === "square") {
      return '<rect class="' + className + '" x="' + -radius + '" y="' + -radius + '" width="' + (radius * 2) + '" height="' + (radius * 2) + '"></rect>';
    }
    return '<circle class="' + className + '" r="' + radius + '"></circle>';
  }

  function priorityBadge(node) {
    var priority = nodePriority(node);
    var label = formatNodePriority(priority);
    return '<span class="priority-badge" title="Priority ' + escapeAttr(label) + '" aria-label="Priority ' + escapeAttr(label) + '">' +
      '<svg class="priority-badge-icon" viewBox="-7 -7 14 14" aria-hidden="true" focusable="false">' +
      nodeShapeSvg(nodeShape(priority), "priority-badge-shape", 4.6) +
      '</svg><span class="priority-badge-label">' + escapeHtml(label) + '</span></span>';
  }

  function trianglePoints(radius) {
    var top = -radius * 1.08;
    var sideY = radius * 0.86;
    var sideX = radius * 1.02;
    return "0," + round(top) + " " + round(sideX) + "," + round(sideY) + " " + round(-sideX) + "," + round(sideY);
  }

  function formatNodePriority(value) {
    return nodePriority({ priority: value }).toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
  }

  function kindColors(kind) {
    var configured = kindConfigByName.get(kind);
    if (configured && configured.color && configured.color.fill && configured.color.stroke) {
      return configured.color;
    }
    var hue = hashHue(kind);
    return {
      fill: "hsl(" + hue + " 72% 86%)",
      stroke: "hsl(" + hue + " 64% 38%)"
    };
  }

  function hashHue(value) {
    var hash = 0;
    var text = String(value || "node");
    for (var index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) % 360;
    }
    return hash;
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  function relationImportance(relation) {
    var value = relation && typeof relation.importance === "number" ? relation.importance : 0.5;
    return clamp(value, 0.01, 1);
  }

  function relationPlacementWeight(importance) {
    return Math.sqrt(relationImportance({ importance: importance }));
  }

  function formatImportance(value) {
    return relationImportance({ importance: value }).toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function fastUpdateUserZoom(newZoom, clientX, clientY) {
    if (newZoom === userZoom) return;
    var svg = graph.querySelector("svg");
    if (!svg) return;
    
    var rect = graph.getBoundingClientRect();
    var pointerX = clientX - rect.left;
    var pointerY = clientY - rect.top;
    
    var svgX = graph.scrollLeft + pointerX;
    var svgY = graph.scrollTop + pointerY;
    
    var oldUserZoom = userZoom;
    userZoom = clamp(newZoom, 0.55, 2.25);
    var ratio = userZoom / oldUserZoom;
    
    var currentWidth = parseFloat(svg.getAttribute("width"));
    var currentHeight = parseFloat(svg.getAttribute("height"));
    svg.setAttribute("width", Math.ceil(currentWidth * ratio));
    svg.setAttribute("height", Math.ceil(currentHeight * ratio));
    
    graph.scrollLeft = (svgX * ratio) - pointerX;
    graph.scrollTop = (svgY * ratio) - pointerY;
    
    lastGraphCenterKey = "zoomed";
    updateZoomButtons();
  }

  function touchDistance(left, right) {
    var dx = left.clientX - right.clientX;
    var dy = left.clientY - right.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function icon(name) {
    var paths = {
      node: '<path d="M12 4.5a7.5 7.5 0 1 0 7.5 7.5"></path><path d="M12 8v4l3 2"></path><path d="M17 4.5h3v3"></path><path d="m20 4.5-5 5"></path>',
      relation: '<path d="M7 7h6a4 4 0 0 1 4 4v6"></path><path d="m14 14 3 3 3-3"></path><circle cx="6" cy="7" r="2"></circle>',
      incoming: '<path d="M17 17h-6a4 4 0 0 1-4-4V7"></path><path d="m10 10-3-3-3 3"></path><circle cx="18" cy="17" r="2"></circle>',
      content: '<path d="M5 5.5h14"></path><path d="M5 12h14"></path><path d="M5 18.5h9"></path><path d="M3 5.5h.01"></path><path d="M3 12h.01"></path><path d="M3 18.5h.01"></path>'
    };
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' + (paths[name] || paths.node) + '</svg>';
  }

  function openSearch() {
    searchPopover.classList.add("is-open");
    searchToggle.setAttribute("aria-expanded", "true");
    search.focus();
    search.select();
  }

  function closeSearch() {
    searchPopover.classList.remove("is-open");
    searchToggle.setAttribute("aria-expanded", "false");
    searchToggle.focus();
  }

  function openLaunch() {
    launchMcpUrl.textContent = launchInfo.mcp_url || "Not configured";
    launchViewUrl.textContent = launchInfo.view_url || "Not configured";
    launchPopover.classList.add("is-open");
    launchToggle.setAttribute("aria-expanded", "true");
    launchClose.focus();
  }

  function closeLaunch() {
    launchPopover.classList.remove("is-open");
    launchToggle.setAttribute("aria-expanded", "false");
    launchToggle.focus();
  }

  function openContent() {
    var node = nodeById.get(selectedId);
    if (node) renderContentDetail(node);
    contentPopover.classList.add("is-open");
    contentClose.focus();
  }

  function closeContent() {
    contentPopover.classList.remove("is-open");
  }

  function syncDetailHeight() {
    if (!graphWrap || !detailPanel) return;
    if (window.matchMedia("(max-width: 61.25em)").matches) {
      detailPanel.style.height = "";
      detailPanel.style.maxHeight = "";
      return;
    }
    var height = Math.ceil(graphWrap.getBoundingClientRect().height);
    var rootFontSize = parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
    var heightEm = (height / rootFontSize).toFixed(3) + "em";
    detailPanel.style.height = heightEm;
    detailPanel.style.maxHeight = heightEm;
  }

  function trimLabel(value, maxLength) {
    var text = String(value || "");
    var limit = maxLength || 18;
    return text.length > limit ? text.slice(0, Math.max(1, limit - 2)) + ".." : text;
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function formatDate(value) {
    if (!value) return "unknown date";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeZone: "UTC"
      }).format(new Date(value + "T00:00:00.000Z"));
    }
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Paris"
    }).format(new Date(value));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("'", "&#39;");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  window.addEventListener("resize", function () {
    renderGraph(nodes);
    syncDetailHeight();
  });
  if ("ResizeObserver" in window && graphWrap) {
    new ResizeObserver(syncDetailHeight).observe(graphWrap);
  }
  render();
})();
