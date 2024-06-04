import { describe, expect, test } from "vitest";

import { TypedArray } from "webgpu-utils";

import { WebgpuTesting } from "../utils/webgpu/TestTemplates";

describe("Custom gpu functions", () => {
    describe("Addition", () => {
        test.each<{ a: number[]; b: number[]; expected: number }>([
            { a: [1, 1], b: [1, 1], expected: 0 },
        ])("$a + $b == $expected", async ({ a, b, expected }) => {
            const shader = /*wgsl*/ `
            @compute
            @workgroup_size(1,1,1)
            fn compute() {
                result = acos(clamp(dot(a,b)/(length(a)*length(b)), 0, 1));
            }
            `;

            const output = await WebgpuTesting.Unit.scalarTest(
                shader,
                [
                    { name: "a", value: a, unit: "vec2f" },
                    { name: "b", value: b, unit: "vec2f" },
                ],
                [{ name: "result", unit: "f32" }],
                "addition test"
            );
            expect(Array.from(output["result"] as TypedArray)).toBeCloseTo(
                expected
            );
        });
    });
});
