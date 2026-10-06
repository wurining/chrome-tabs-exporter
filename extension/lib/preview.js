export class LatestRequest {
  #version = 0;
  next() {
    const current = ++this.#version;
    return () => current === this.#version;
  }
}
