import { describe, expect, test } from "vitest";

import { TypedArray } from "webgpu-utils";

import { WebgpuTesting } from "../utils/webgpu/TestTemplates";

describe("Basic gpu functions", () => {
    describe("Addition", () => {
        test.each<{ a: number[]; b: number[]; expected: number[] }>([
            { a: [1, 2], b: [2, 5], expected: [3, 7] },
        ])("$a + $b == $expected", async ({ a, b, expected }) => {
            const shader = /*wgsl*/ `
            @compute
            @workgroup_size(1,1,1)
            fn compute() {
                result = a + b;
            }
            `;

            const output = await WebgpuTesting.Unit.scalarTest(
                shader,
                [
                    { name: "a", value: a, unit: "vec2f" },
                    { name: "b", value: b, unit: "vec2f" },
                ],
                [{ name: "result", unit: "vec2f" }],
                "addition test"
            );
            expect(Array.from(output["result"] as TypedArray)).toEqual(
                expected
            );
        });
    });
});
