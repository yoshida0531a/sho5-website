export function createDocument() {
  function make(tag) {
    return {
      tagName: String(tag).toUpperCase(),
      className: '',
      children: [],
      attrs: {},
      style: {},
      _text: '',
      set textContent(value) {
        this._text = String(value);
      },
      get textContent() {
        return this._text;
      },
      set innerHTML(_) {
        throw new Error('innerHTML is not allowed');
      },
      get innerHTML() {
        throw new Error('innerHTML is not allowed');
      },
      setAttribute(name, value) {
        this.attrs[name] = String(value);
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
    };
  }
  return { createElement: make };
}

export function walk(node, visit) {
  visit(node);
  for (const child of node.children || []) walk(child, visit);
}
