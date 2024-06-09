import { describe, expect, test } from "vitest";

import { TypedArray } from "webgpu-utils";

import { WebgpuTesting } from "../../../../TestTemplates";

import { basic_maths } from "../../../../../src/utils/webgpu/shader scripts/basic_maths";

describe("Custom gpu functions: basic maths", () => {
    describe("Interpolation using weights: vec2f", () => {
        test.each<{
            a: [number, number];
            w_a: [number];
            b: [number, number];
            w_b: [number];
            expected: [number, number];
        }>([
            { a: [1, 2], w_a: [1], b: [0, 0], w_b: [1], expected: [0.5, 1] },
            { a: [0, 0], w_a: [0], b: [0, 0], w_b: [0], expected: [0, 0] },
            { a: [1, 2], w_a: [1], b: [0, 0], w_b: [0], expected: [1, 2] },
        ])(
            "($a, $b, $w_a, $w_b) => $expected",
            async ({ a, b, w_a, w_b, expected }) => {
                const shader = /*wgsl*/ `
            //includes
            ${basic_maths}
            
            @compute
            @workgroup_size(1,1,1)
            fn compute() {
                result = interp_weights_vec2f(a,b,w_a,w_b);
            }
            `;

                const output = await WebgpuTesting.Unit.scalarTest(
                    shader,
                    [
                        { name: "a", value: a, unit: "vec2f" },
                        { name: "b", value: b, unit: "vec2f" },
                        { name: "w_a", value: w_a, unit: "f32" },
                        { name: "w_b", value: w_b, unit: "f32" },
                    ],
                    [{ name: "result", unit: "vec2f" }],
                    "addition test"
                );
                (output["result"] as TypedArray).forEach((elem, idx) =>
                    expect(elem).toBeCloseTo(expected[idx])
                );
                console.log(output["result"], " == ", expected);
            }
        );
    });
});
