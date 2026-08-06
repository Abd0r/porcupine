// In-memory cache. Fixed: every put overwrites the key and bumps the version.
export class ConfigCache {
  constructor() {
    this.store = new Map();
    this._version = 0;
  }

  put(key, value) {
    const version = this._version;
    this._version += 1;
    this.store.set(key, { value, version });
    return this._version;
  }

  get(key) {
    const entry = this.store.get(key);
    return entry ? entry.value : undefined;
  }

  readVersion(key) {
    const entry = this.store.get(key);
    return entry ? entry.version : -1;
  }
}
