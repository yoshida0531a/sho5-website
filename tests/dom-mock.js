export function createDocument() {
  function make(tag) {
    const listeners = new Map();
    return {
      tagName: String(tag).toUpperCase(),
      className: '',
      children: [],
      attrs: {},
      style: {},
      value: '',
      classList: {
        add() {},
        remove() {},
      },
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
      replaceChildren(...children) {
        this.children = children;
      },
      addEventListener(type, callback) {
        listeners.set(type, callback);
      },
      dispatchEvent(event) {
        listeners.get(event.type)?.(event);
      },
    };
  }
  return { createElement: make };
}

export function walk(node, visit) {
  visit(node);
  for (const child of node.children || []) walk(child, visit);
}
