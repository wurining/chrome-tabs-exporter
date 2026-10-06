const paths = {
  settings: ["M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0"],
  refresh: ["M20 10a8 8 0 1 0-2 8", "M20 4v6h-6"],
  chevron: ["m8 10 4 4 4-4"],
  document: ["M14 3H5v18h14V8z", "M14 3v5h5", "M8 12h8M8 16h6"],
  json: ["M8 4H6v6l-2 2 2 2v6h2", "M16 4h2v6l2 2-2 2v6h-2", "M11 9h2M11 15h2"],
  shield: ["M12 3 4 6v6c0 4 3 7 8 9 5-2 8-5 8-9V6z", "m8 12 3 3 5-6"],
  import: ["M14 3H5v18h14V8z", "M14 3v5h5", "M12 10v7m-3-3 3 3 3-3"],
  window: ["M3 4h18v16H3z", "M3 9h18M7 6.5h.01M10 6.5h.01"]
};

export function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) svg.setAttribute(key, value);
  svg.classList.add("icon");
  for (const d of paths[name] || []) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

export function mountIcons(root = document) {
  for (const element of root.querySelectorAll("[data-icon]")) element.replaceChildren(icon(element.dataset.icon));
}
