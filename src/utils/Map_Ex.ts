export default class Map_Ex<K, V> extends Map<K, V> {
    getOrDefaultSet(key: K, defaultValue: V): V {
        if (this.has(key)) return this.get(key);
        this.set(key, defaultValue);
        return defaultValue;
    }
}
