export class Counter {
    private _count = 0;

    increment() {
        this._count++;
    }
    reached(threshold: number) {
        return this._count >= threshold;
    }
    reset() {
        this._count = 0;
    }
}
