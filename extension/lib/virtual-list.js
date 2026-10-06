// Keep the full row model, but mount only visible rows and a small scroll buffer.
// Native checkboxes remain reachable with Tab, arrows, Home and End.
export class VirtualList {
  constructor(element, renderRow, rowHeight = 36) {
    this.element = element;
    this.renderRow = renderRow;
    this.rowHeight = rowHeight;
    this.rows = [];
    element.addEventListener("scroll", () => this.schedule());
    this.observer = new ResizeObserver(() => this.schedule());
    this.observer.observe(element);
    element.addEventListener("keydown", (event) => this.navigate(event));
  }
  schedule() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }
  setRows(rows) {
    this.rows = rows;
    this.element.scrollTop = Math.min(this.element.scrollTop, Math.max(0, rows.length * this.rowHeight - this.element.clientHeight));
    this.render();
  }
  render() {
    const focusKey = this.element.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
    const start = Math.max(0, Math.floor(this.element.scrollTop / this.rowHeight) - 3);
    const end = Math.min(this.rows.length, Math.ceil((this.element.scrollTop + this.element.clientHeight) / this.rowHeight) + 3);
    const spacer = (height) => {
      const div = document.createElement("div");
      div.style.height = `${height}px`;
      div.setAttribute("aria-hidden", "true");
      return div;
    };
    const elements = [spacer(start * this.rowHeight)];
    for (let index = start; index < end; index++) {
      const row = this.renderRow(this.rows[index], index);
      row.dataset.rowIndex = index;
      elements.push(row);
    }
    elements.push(spacer((this.rows.length - end) * this.rowHeight));
    this.element.replaceChildren(...elements);
    if (focusKey) this.findFocus(focusKey)?.focus({ preventScroll: true });
  }
  findFocus(key) { return Array.from(this.element.querySelectorAll("[data-focus-key]")).find((element) => element.dataset.focusKey === key); }
  focus(index, reverse = false) {
    if (index < 0 || index >= this.rows.length) return false;
    const top = index * this.rowHeight;
    if (top < this.element.scrollTop) this.element.scrollTop = top;
    else if (top + this.rowHeight > this.element.scrollTop + this.element.clientHeight) this.element.scrollTop = top + this.rowHeight - this.element.clientHeight;
    this.render();
    const targets = this.element.querySelector(`[data-row-index="${index}"]`)?.querySelectorAll("input, button");
    if (!targets?.length) return false;
    targets[reverse ? targets.length - 1 : 0].focus({ preventScroll: true });
    return true;
  }
  navigate(event) {
    const row = event.target.closest("[data-row-index]");
    if (!row) return;
    const index = Number(row.dataset.rowIndex);
    const direction = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey) ? -1 : 1;
    let next;
    if (["ArrowDown", "ArrowUp"].includes(event.key)) next = index + direction;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = this.rows.length - 1;
    else if (event.key === "Tab") {
      const targets = [...row.querySelectorAll("input, button")];
      if (targets[direction === 1 ? targets.length - 1 : 0] !== event.target) return;
      next = index + direction;
    } else return;
    while (next >= 0 && next < this.rows.length) {
      if (this.rows[next].type !== "heading") { event.preventDefault(); this.focus(next, direction < 0); return; }
      next += direction;
    }
  }
}
