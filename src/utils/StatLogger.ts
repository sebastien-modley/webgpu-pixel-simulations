import { Counter } from "./Counter";
import Map_Ex from "./Map_Ex";

export class StatLogger {
    framesToAverageOver: number | null;
    currentFrame: number = 0;
    stats_sum: Map_Ex<any, any> = new Map_Ex<any, any>();
    stats_counter: Map_Ex<any, Counter> = new Map_Ex<any, Counter>();

    constructor(average_over: number | null) {
        this.framesToAverageOver = average_over;
    }

    log(name: string, value: any): void {
        if (!this.framesToAverageOver) {
            console.log(`${name}: ${value}`);
        }

        this._add(name, value);

        let counter = this._counter(name);
        if (counter.reached(this.framesToAverageOver)) {
            console.log(
                `avg ${name}: ${
                    this.stats_sum.get(name) / this.framesToAverageOver
                }`
            );
            this._reset(name);
        }
    }

    private _counter(name: string) {
        return this.stats_counter.getOrDefaultSet(name, new Counter());
    }

    private _reset(name: string) {
        this.stats_sum.delete(name);
        this.stats_counter.delete(name);
    }

    private _add(name: string, value: any) {
        this.stats_sum.set(
            name,
            this.stats_sum.has(name) ? this.stats_sum.get(name) + value : value
        );

        this._counter(name).increment();
    }
}
